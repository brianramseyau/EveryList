<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Label, Select } from 'flowbite-svelte';
	import type { CategoryDto, FavoriteItemDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList, fetchLists } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { fetchItems, moveItemToList, updateItem } from '$lib/api/items';
	import { fetchStores } from '$lib/api/stores';
	import { createFavorite, deleteFavorite, fetchFavorites } from '$lib/api/favorites';
	import { getDb } from '$lib/offline/db';
	import { ApiError } from '$lib/api/client';
	import { connectivity } from '$lib/offline/connectivity.svelte';
	import { splitDeadline } from '$lib/deadline';
	import {
		getDeadlineNotificationsPreference,
		resyncDeadlineNotifications
	} from '$lib/notifications/sync';
	import { consumeListOrigin } from '$lib/nav-direction';
	import { createDirtyGuard } from '$lib/dirty-guard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ItemFields from '$lib/components/ItemFields.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import RescheduleOverlay from '$lib/components/RescheduleOverlay.svelte';

	const listId = $derived(Number(page.params.id));
	const itemId = $derived(Number(page.params.itemId));

	let list = $state<ListDto | null>(null);
	let item = $state<ItemDto | null>(null);
	let categories = $state<CategoryDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let favorites = $state<FavoriteItemDto[]>([]);
	let togglingFavorite = $state(false);
	let allLists = $state<ListDto[]>([]);
	let draftMoveTargetId = $state<number | null>(null);
	let moving = $state(false);
	// Set once on mount from $lib/nav-direction's marker — true only when this
	// page was reached by clicking into it from the list (not a cold/deep-link
	// visit, e.g. the native widget's "open item" tap) — see `returnToList`.
	let cameFromList = false;

	// Only lists the user can actually write to — matches the "owner or editor" bar the server
	// enforces on the destination in ItemsController#moveToList.
	const moveTargets = $derived(
		allLists.filter((l) => l.id !== listId && (l.role === 'owner' || l.role === 'editor'))
	);

	// Only read while `item` is loaded — the heart button that reads this is
	// gated behind `{#if item}` in the template, so `item!` is always safe here.
	const matchingFavorite = $derived(
		favorites.find(
			(favorite) => favorite.name.trim().toLowerCase() === item!.name.trim().toLowerCase()
		) ?? null
	);

	let draftName = $state('');
	let draftQuantity = $state('');
	let draftNotes = $state('');
	let draftPrice = $state('');
	let draftCategoryId = $state<number | null>(null);
	let draftStoreId = $state<number | null>(null);
	// PLAN_24: date and time drafts are kept separately ('' = unset) so the
	// native date/time inputs bind directly; save() recombines them into the
	// API's single 'YYYY-MM-DD[THH:mm]' string.
	let draftDeadlineDate = $state('');
	let draftDeadlineTime = $state('');

	// Snapshot of the draft fields as loaded, for the dirty check below —
	// plain (non-reactive) since it's only written once, right after the
	// draft fields it's compared against.
	let originalDraft: {
		name: string;
		quantity: string;
		notes: string;
		price: string;
		categoryId: number | null;
		storeId: number | null;
		deadlineDate: string;
		deadlineTime: string;
	} | null = null;
	let saved = $state(false);
	// Opened when this page is reached via the deadline notification's "Reschedule" action
	// (push-sw.js / native.ts navigate here with `?reschedule=1`) — stripped from the URL on close
	// so a refresh or back-navigation doesn't reopen it.
	let rescheduleOpen = $state(false);

	// `newDeadline` is set only on a successful reschedule (undefined on cancel/Escape/outside-
	// click) — without feeding it back into `item` and the drafts here, this page's own state
	// would still show the pre-reschedule deadline, and a later Save would silently send that
	// stale value right back over the change the overlay just made.
	function closeReschedule(newDeadline?: string) {
		rescheduleOpen = false;
		// `item` and `originalDraft` are always set together, by loadAll() — this overlay can only
		// ever be open once that's happened (see the $effect below), so there's no case where one
		// is set without the other.
		if (newDeadline !== undefined && item && originalDraft) {
			item = { ...item, deadline: newDeadline };
			const { date, time } = splitDeadline(newDeadline);
			draftDeadlineDate = date;
			draftDeadlineTime = time;
			originalDraft = { ...originalDraft, deadlineDate: date, deadlineTime: time };
		}
		// Always the current page's own URL with one query param removed — safe, but not
		// statically verifiable by the lint rule (see +layout.svelte's own goto() for the same
		// technique).
		const url = new URL(page.url);
		url.searchParams.delete('reschedule');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(url, page.state);
	}

	const isDirty = $derived.by(() => {
		const original = originalDraft;
		if (saved || !original) return false;
		return (
			draftName !== original.name ||
			draftQuantity !== original.quantity ||
			draftNotes !== original.notes ||
			draftPrice !== original.price ||
			draftCategoryId !== original.categoryId ||
			draftStoreId !== original.storeId ||
			draftDeadlineDate !== original.deadlineDate ||
			draftDeadlineTime !== original.deadlineTime
		);
	});

	const dirtyGuard = createDirtyGuard(() => isDirty);

	// Offline-first: an item opened from the list-detail page is already in
	// Dexie, so this reads locally first (works with zero network, matching
	// every other list-scoped screen) and only falls back to a full list
	// fetch for a cold direct-navigation/reload that never cached this item.
	async function loadItem(): Promise<ItemDto | null> {
		const db = getDb();
		const cached = db ? await db.items.get(itemId) : undefined;
		if (cached) return cached;
		const items = await fetchItems(listId);
		return items.find((current) => current.id === itemId) ?? null;
	}

	async function loadAll() {
		loading = true;
		try {
			const [listResult, itemResult, categoriesResult, storesResult, favoritesResult, listsResult] =
				await Promise.all([
					fetchList(listId),
					loadItem(),
					fetchCategories(listId),
					fetchStores(listId),
					fetchFavorites(listId),
					fetchLists()
				]);
			list = listResult;
			item = itemResult;
			categories = categoriesResult;
			stores = storesResult;
			favorites = favoritesResult;
			allLists = listsResult;

			if (item) {
				draftName = item.name;
				draftQuantity = item.quantity ?? '';
				draftNotes = item.notes ?? '';
				draftPrice = item.price !== null ? (item.price / 100).toFixed(2) : '';
				draftCategoryId = item.categoryId;
				draftStoreId = item.storeId;
				const deadline = item.deadline ? splitDeadline(item.deadline) : null;
				draftDeadlineDate = deadline?.date ?? '';
				draftDeadlineTime = deadline?.time ?? '';
				originalDraft = {
					name: draftName,
					quantity: draftQuantity,
					notes: draftNotes,
					price: draftPrice,
					categoryId: draftCategoryId,
					storeId: draftStoreId,
					deadlineDate: draftDeadlineDate,
					deadlineTime: draftDeadlineTime
				};
				error = null;
			} else {
				error = 'Item not found.';
			}
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load item.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		cameFromList = consumeListOrigin();
	});

	// Loads (or reloads) whenever the route's itemId changes, not just once on mount —
	// SvelteKit reuses this mounted component for a same-route navigation between two different
	// items (e.g. +layout.svelte's onTap/onReschedule landing here for a *different* item while
	// this page is already open on one), and without this `item` would keep showing the previous
	// item's data indefinitely instead of loading the new one.
	$effect(() => {
		if (getToken()) void loadAll();
	});

	// Reacts to the `reschedule` search param directly, rather than only checking it once inside
	// loadAll() — the deadline notification's Reschedule action navigates here with `?reschedule=1`
	// (see +layout.svelte's onReschedule / push-sw.js), but if the app is already sitting on this
	// exact item route, SvelteKit reuses the mounted component for a search-param-only navigation,
	// so a param-only check confined to loadAll() would silently never open the overlay for that
	// case. Guarded on `item.id === itemId`, not just `item?.deadline`, so a same-route navigation
	// to a *different* item (itemId already updated, but the previous item's `loadAll()` hasn't
	// resolved yet) can't briefly open the overlay against stale, mismatched item data.
	$effect(() => {
		if (item?.id === itemId && item.deadline && page.url.searchParams.get('reschedule')) {
			rescheduleOpen = true;
		}
	});

	// Prefers a real `history.back()` over pushing a fresh navigation back to
	// the list — SvelteKit only restores the list's prior scroll position for
	// an actual back/forward traversal (see nav-direction.ts), so this is what
	// makes Save return you to where you were instead of the top of the list.
	// Falls back to the plain push when this page wasn't reached from the
	// list in the first place (`cameFromList` false), since there's then no
	// list entry in history to go back to.
	async function returnToList() {
		if (cameFromList) {
			window.history.back();
			return;
		}
		await goto(resolve('/lists/[id]', { id: String(listId) }));
	}

	async function save() {
		if (!draftName.trim() || saving) return;
		const trimmedPrice = draftPrice.trim();
		const price = trimmedPrice === '' ? null : Math.round(Number(trimmedPrice) * 100);
		if (price !== null && !Number.isFinite(price)) return;

		saving = true;
		try {
			await updateItem(listId, itemId, {
				name: draftName.trim(),
				quantity: draftQuantity.trim() || null,
				notes: draftNotes.trim() || null,
				price,
				categoryId: draftCategoryId,
				storeId: draftStoreId,
				// Time requires a date — ItemFields clears the time draft when the
				// date is cleared, but the guard here makes the invariant hold even
				// if that ever regresses.
				deadline: draftDeadlineDate
					? draftDeadlineTime
						? `${draftDeadlineDate}T${draftDeadlineTime}`
						: draftDeadlineDate
					: null
			});
			// A deadline set/changed/cleared here otherwise sits unreflected in the native/Electron
			// local schedule until the app's next launch, resume, or 5-minute tick (+layout.svelte's
			// syncDeadlineNotifications) — long enough that a near-term deadline can pass, and its
			// notification silently never get scheduled at all, before any of those triggers fire.
			if (getDeadlineNotificationsPreference()) void resyncDeadlineNotifications();
			saved = true;
			await returnToList();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save item.';
			saving = false;
		}
	}

	async function moveToList() {
		if (!draftMoveTargetId || moving || connectivity.serverUnavailable) return;
		moving = true;
		try {
			await moveItemToList(listId, itemId, draftMoveTargetId);
			// The item now belongs to the destination list server-side — an
			// unsaved draft here is stale regardless, and letting the guard
			// intercept this goto() would leave the user stuck on this now-wrong
			// list/item pairing if they chose Cancel.
			saved = true;
			await goto(resolve('/lists/[id]', { id: String(draftMoveTargetId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to move item.';
			moving = false;
			// The move itself may have already succeeded server-side before this
			// goto() rejected — either way, the page is still mounted and further
			// edits here are unverified against whichever list the item now
			// actually belongs to, so re-arm the guard rather than leave it
			// permanently bypassed.
			saved = false;
		}
	}

	async function toggleFavorite() {
		if (togglingFavorite) return;
		togglingFavorite = true;
		try {
			if (matchingFavorite) {
				await deleteFavorite(listId, matchingFavorite.id);
				favorites = favorites.filter((favorite) => favorite.id !== matchingFavorite.id);
			} else {
				const favorite = await createFavorite(listId, {
					name: item!.name,
					defaultQuantity: item!.quantity,
					storeId: item!.storeId,
					notes: item!.notes,
					price: item!.price
				});
				favorites = [...favorites, favorite];
			}
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update favorites.';
		} finally {
			togglingFavorite = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}

	// Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux, incl. the Electron shell
	// there) saves from anywhere in the form, including the notes textarea
	// where a plain Enter inserts a newline instead of submitting.
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void save();
		}
	}
</script>

<svelte:window onbeforeunload={dirtyGuard.beforeunload} />

{#if dirtyGuard.open}
	<ConfirmDialog
		message="You have unsaved changes to this item. Discard them?"
		onConfirm={dirtyGuard.confirmDiscard}
		onCancel={dirtyGuard.cancelDiscard}
	/>
{/if}

{#if rescheduleOpen && item?.deadline}
	<RescheduleOverlay {listId} {itemId} deadline={item.deadline} onClose={closeReschedule} />
{/if}

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title="Item"
		subtitle={list?.name}
		htmlTitle={item ? item.name : 'Item'}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
		onBack={returnToList}
	>
		{#snippet actions()}
			{#if item}
				<button
					type="button"
					aria-label={matchingFavorite ? 'Remove from favorites' : 'Add to favorites'}
					aria-pressed={Boolean(matchingFavorite)}
					class="flex h-9 w-9 shrink-0 items-center justify-center text-gray-400 disabled:opacity-30 dark:text-gray-500"
					class:text-red-600={Boolean(matchingFavorite)}
					class:dark:text-red-400={Boolean(matchingFavorite)}
					disabled={togglingFavorite}
					onclick={toggleFavorite}
				>
					<Icon name={matchingFavorite ? 'heart' : 'heartOutline'} class="h-5 w-5" />
				</button>
				<Button type="button" size="sm" disabled={saving || !draftName.trim()} onclick={save}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if loading}
		<Loader />
	{:else if item}
		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<form class="flex flex-col gap-4" onsubmit={handleSubmit} onkeydown={handleKeydown}>
			<ItemFields
				bind:name={draftName}
				bind:quantity={draftQuantity}
				bind:price={draftPrice}
				bind:categoryId={draftCategoryId}
				bind:storeId={draftStoreId}
				bind:notes={draftNotes}
				bind:deadlineDate={draftDeadlineDate}
				bind:deadlineTime={draftDeadlineTime}
				autofocusName={false}
				{categories}
				{stores}
				showCategory={list?.useCategories !== false}
				showQuantity={list?.useQuantity !== false}
				showPrice={list?.usePrice !== false}
				showStore={list?.useShops !== false}
				showDeadline={list?.useDeadline === true}
			/>
		</form>

		{#if moveTargets.length > 0}
			<div class="flex flex-col gap-1 border-t border-gray-200 pt-4 dark:border-gray-700">
				<Label for="item-move-target" class="flex items-center gap-1">
					<Icon name="folderMoveOutline" class="h-4 w-4" />
					Move to list
					{#if connectivity.serverUnavailable}
						<span title="Move requires a connection">
							<Icon name="cloudOffOutline" class="h-4 w-4 text-amber-600 dark:text-amber-400" />
						</span>
					{/if}
				</Label>
				<div class="flex gap-2">
					<Select
						id="item-move-target"
						size="sm"
						items={moveTargets.map((l) => ({ value: l.id, name: l.name }))}
						placeholder="Choose a list…"
						clearable
						value={draftMoveTargetId ?? ''}
						disabled={connectivity.serverUnavailable}
						onchange={(event) => {
							const raw = (event.target as HTMLSelectElement).value;
							draftMoveTargetId = raw === '' ? null : Number(raw);
						}}
					/>
					<Button
						type="button"
						size="sm"
						color="alternative"
						class="shrink-0"
						disabled={!draftMoveTargetId || moving || connectivity.serverUnavailable}
						onclick={moveToList}
						title={connectivity.serverUnavailable ? 'Move requires a connection' : undefined}
					>
						{moving ? 'Moving…' : 'Move'}
					</Button>
				</div>
			</div>
		{/if}
	{:else}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
