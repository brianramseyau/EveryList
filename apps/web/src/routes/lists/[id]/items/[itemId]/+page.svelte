<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
	import Icon from '$lib/components/Icon.svelte';
	import ItemFields from '$lib/components/ItemFields.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

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
		void loadAll();
	});

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
				storeId: draftStoreId
			});
			await goto(resolve('/lists/[id]', { id: String(listId) }));
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
			await goto(resolve('/lists/[id]', { id: String(draftMoveTargetId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to move item.';
			moving = false;
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
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title="Item"
		subtitle={list?.name}
		htmlTitle={item ? item.name : 'Item'}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
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
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if item}
		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
			<ItemFields
				bind:name={draftName}
				bind:quantity={draftQuantity}
				bind:price={draftPrice}
				bind:categoryId={draftCategoryId}
				bind:storeId={draftStoreId}
				bind:notes={draftNotes}
				{categories}
				{stores}
				showCategory={list?.useCategories !== false}
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
