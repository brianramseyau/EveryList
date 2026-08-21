<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { CategoryDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { createItem, deleteItem, fetchItems, updateItem } from '$lib/api/items';
	import { fetchStoreCategoryOrder, fetchStores } from '$lib/api/stores';
	import { getSelectedStoreSettings } from '$lib/api/selected-store';
	import { isRowDirty, type StoreFilter } from '$lib/offline/db';
	import { isSelfMutation } from '$lib/offline/self-mutations';
	import { ApiError } from '$lib/api/client';
	import { subscribeToList } from '$lib/realtime';
	import { onConflict, onFlushOutcome } from '$lib/offline/flush';
	import { refreshBadgeCount } from '$lib/pwa/badge';
	import { isListUnlocked } from '$lib/passcode';
	import { getShowChecked, setShowChecked } from '$lib/list-prefs';
	import { sortableReorder } from '$lib/actions/sortable-reorder';
	import { computeMidpointSortOrder } from '$lib/item-sort-order';
	import { swipeReveal } from '$lib/actions/swipe-reveal';
	import Icon from '$lib/components/Icon.svelte';
	import ItemAutocomplete from '$lib/components/ItemAutocomplete.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PasscodeGate from '$lib/components/PasscodeGate.svelte';
	import PopoutMenu from '$lib/components/PopoutMenu.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let unlocked = $state(false);
	let categories = $state<CategoryDto[]>([]);
	let items = $state<ItemDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	// The store currently "shopping at" (PHASE10_PLAN.md #0.5) — local/device-only,
	// see $lib/api/selected-store.ts. Drives the category aisle order (via
	// `storeCategoryOverrides`) and the header store icon's color. Which items are
	// *shown* is a separate, decoupled setting (`storeFilter`) so you can walk the
	// store's aisle layout while still seeing items tagged to other stores.
	let selectedStoreId = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newItemName = $state('');
	let adding = $state(false);
	let itemInputFocused = $state(false);
	// Which bulk-action the inline confirmation banner is asking about — the
	// menu's destructive options (clear checked, uncheck all, clear all) all
	// route through one banner, distinguished by this value.
	let confirmAction = $state<'clearChecked' | 'uncheckAll' | 'clearAll' | null>(null);

	// Measured height of the pinned header (title bar + item entry field), so
	// category headings can stick just beneath it instead of overlapping it.
	let stickyHeaderHeight = $state(0);

	// Briefly highlights a row when adding matched an existing item instead of
	// creating a new one (PHASE10_PLAN.md #0.2) — both the local pre-check and
	// a server-side match (same id already in `items`) route through this.
	let highlightedItemId = $state<number | null>(null);
	let highlightTimeout: ReturnType<typeof setTimeout> | undefined;

	function flashHighlight(itemId: number) {
		highlightedItemId = itemId;
		if (highlightTimeout) clearTimeout(highlightTimeout);
		highlightTimeout = setTimeout(() => {
			highlightedItemId = null;
		}, 1200);
	}

	// Sets the sticky category heading's offset imperatively (rather than a
	// templated style attribute) so it tracks stickyHeaderHeight without
	// re-running the whole element's attribute diff on every resize.
	function stickyTop(node: HTMLElement, top: number) {
		node.style.top = `${top}px`;
		return {
			update(newTop: number) {
				node.style.top = `${newTop}px`;
			}
		};
	}

	// Checked items stay under their category header instead of moving to a
	// separate section (PHASE9_PLAN.md #3) — this toggle controls whether
	// they're visible at all, defaulting to shown. Persisted per list/device
	// via $lib/list-prefs so it survives reload and revisiting the list.
	let showChecked = $state(true);

	let unsubscribeRealtime: (() => void) | null = null;
	let unsubscribeConflict: (() => void) | null = null;
	let unsubscribeFlushOutcome: (() => void) | null = null;

	// Coarse (touch) pointers get the swipe-to-delete gesture; fine pointers
	// (mouse/trackpad) get a static "×" fallback instead (PHASE9_PLAN.md #9)
	// — checked once on mount since input capability doesn't change mid-session.
	let isCoarsePointer = $state(false);

	// Store-specific aisle order, if the shopper has picked a store for this
	// list on this device — purely local, see $lib/api/selected-store.ts.
	let storeCategoryOverrides: Map<number, number> = new SvelteMap();

	const selectedStore = $derived(stores.find((store) => store.id === selectedStoreId) ?? null);

	// Which items to show, relative to `selectedStore` — decoupled from the store
	// selection so a store can drive the aisle order without hiding items tagged
	// to other stores. `'all'` shows every item; `'store'` shows only the selected
	// store's; `'storeAndUnassigned'` also keeps items with no store.
	let storeFilter = $state<StoreFilter>('store');

	// Only filter once selectedStoreId resolves to a store that's actually still
	// on this list — a stale/orphaned id (e.g. a store removed outside the normal
	// flow) must behave like "no store selected" rather than silently hiding
	// every item with no way to clear it from this screen. `storeFilter` (see the
	// stores page) decides whether a selected store hides other stores' items at
	// all — `'all'` keeps every item on screen regardless of which store it's for.
	const visibleItems = $derived(
		selectedStore === null || storeFilter === 'all'
			? items
			: items.filter(
					(item) =>
						item.storeId === selectedStore.id ||
						(storeFilter === 'storeAndUnassigned' && item.storeId === null)
				)
	);

	const groups = $derived.by(() => {
		const byCategory = new SvelteMap<number | null, ItemDto[]>();
		for (const item of visibleItems) {
			if (item.checked && !showChecked) continue;
			const key = item.categoryId;
			if (!byCategory.has(key)) byCategory.set(key, []);
			byCategory.get(key)!.push(item);
		}

		// Lists that opt out of categories (PHASE11_PLAN.md §E) render as a single
		// flat section — collapse every bucket instead of grouping by categoryId.
		if (list?.useCategories === false) {
			const flat = [...byCategory.values()].flat();
			return flat.length ? [{ category: null, items: flat }] : [];
		}

		const orderedCategories = [...categories].sort((a, b) => {
			const aOrder = storeCategoryOverrides.get(a.id) ?? a.sortOrder;
			const bOrder = storeCategoryOverrides.get(b.id) ?? b.sortOrder;
			return aOrder - bOrder;
		});

		const ordered: { category: CategoryDto | null; items: ItemDto[] }[] = [];
		for (const category of orderedCategories) {
			const bucket = byCategory.get(category.id);
			if (bucket?.length) ordered.push({ category, items: bucket });
		}
		const uncategorized = byCategory.get(null);
		if (uncategorized?.length) ordered.push({ category: null, items: uncategorized });
		return ordered;
	});

	const checkedItems = $derived(visibleItems.filter((item) => item.checked));

	const confirmMessage = $derived.by(() => {
		switch (confirmAction) {
			case 'clearChecked': {
				const n = checkedItems.length;
				return n === 1 ? 'Clear 1 checked item?' : `Clear ${n} checked items?`;
			}
			case 'uncheckAll': {
				const n = checkedItems.length;
				return n === 1 ? 'Uncheck 1 item?' : `Uncheck all ${n} items?`;
			}
			case 'clearAll': {
				const n = items.length;
				return n === 1 ? 'Clear all 1 item?' : `Clear all ${n} items?`;
			}
			default:
				return '';
		}
	});

	const totalCents = $derived(visibleItems.reduce((sum, item) => sum + (item.price ?? 0), 0));

	function formatPrice(cents: number): string {
		return (cents / 100).toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD'
		});
	}

	const totalText = $derived(`Total: ${formatPrice(totalCents)}`);

	const progressText = $derived(`${checkedItems.length} of ${visibleItems.length} done`);

	async function loadAll() {
		loading = true;
		try {
			[list, categories, items, stores] = await Promise.all([
				fetchList(listId),
				fetchCategories(listId),
				fetchItems(listId),
				fetchStores(listId)
			]);
			unlocked = isListUnlocked(listId);

			const settings = await getSelectedStoreSettings(listId);
			selectedStoreId = settings.storeId;
			storeFilter = settings.filter;
			const overrideEntries = selectedStoreId ? await fetchStoreCategoryOrder(selectedStoreId) : [];
			storeCategoryOverrides.clear();
			for (const entry of overrideEntries) {
				storeCategoryOverrides.set(entry.categoryId, entry.sortOrder);
			}

			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load list.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
		showChecked = getShowChecked(listId);
		void loadAll();
		unsubscribeRealtime = subscribeToList(listId, (event) => {
			// Our own edit's broadcast (sent right after the flush clears `_dirty`)
			// is suppressed — the optimistic update already reflects it, so
			// reloading would just churn the DOM mid-gesture (see PHASE14_PLAN.md).
			if (isSelfMutation(event.entityType, event.entityId)) return;
			// An unacked local edit on this exact row means the eventual flush response is
			// authoritative, not this racing broadcast — suppress it (see PHASE5_PLAN.md §4).
			void isRowDirty(event.entityType, event.entityId).then((dirty) => {
				// Silent auto-refresh: the removed "This list was updated" toast was the only
				// previous effect, so re-run the load to keep the list fresh (PHASE14_PLAN.md).
				if (!dirty) void loadAll();
			});
		});
		// The offline flush loop's own conflict reconciliation (offline/flush.ts) can leave this
		// page's in-memory `items`/etc. stale relative to the server's merged copy — there's no live
		// broadcast to catch it, since it happened while this client was offline. Same silent
		// refresh flow as a realtime event, not suppressed by `_dirty` since the flush already
		// cleared it.
		unsubscribeConflict = onConflict(() => {
			void loadAll();
		});
		// A successful flush of this client's own queued offline edits has no realtime broadcast
		// to catch it — the SSE connection is usually still reconnecting when the `online`-driven
		// flush runs, so the broadcast is lost. Reload once the queue drains so the DOM adopts the
		// server's authoritative copy (real ids for offline-created rows, bumped versions) instead
		// of leaving the optimistic temp-id/stale rows on screen until a manual refresh.
		unsubscribeFlushOutcome = onFlushOutcome(({ ok }) => {
			if (ok) void loadAll();
		});
	});

	onDestroy(() => {
		unsubscribeRealtime?.();
		unsubscribeConflict?.();
		unsubscribeFlushOutcome?.();
		if (highlightTimeout) clearTimeout(highlightTimeout);
	});

	async function addItem(rawName: string) {
		if (adding) return;
		const name = rawName.trim();
		if (!name) return;

		// Best-effort local pre-check against what's already loaded (PHASE10_PLAN.md
		// #0.2) — an unchecked match is left alone, just highlighted, so the input
		// isn't cleared and no request is made. A checked match still needs the
		// server round-trip (it flips checked → unchecked), so it falls through.
		const normalized = name.toLowerCase();
		const existingUnchecked = items.find(
			(item) => !item.checked && item.name.trim().toLowerCase() === normalized
		);
		if (existingUnchecked) {
			flashHighlight(existingUnchecked.id);
			return;
		}

		adding = true;
		try {
			const item = await createItem(listId, { name });
			// The server may have matched an existing item instead of creating a new
			// one (a checked match it unchecked) — replace that row in place rather
			// than appending a duplicate.
			const existingIndex = items.findIndex((current) => current.id === item.id);
			items =
				existingIndex === -1
					? [...items, item]
					: items.map((current, index) => (index === existingIndex ? item : current));
			flashHighlight(item.id);
			newItemName = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to add item.';
		} finally {
			adding = false;
		}
	}

	async function handleAddItem(event: SubmitEvent) {
		event.preventDefault();
		await addItem(newItemName);
	}

	async function toggleChecked(item: ItemDto) {
		const nextChecked = !item.checked;
		items = items.map((current) =>
			current.id === item.id ? { ...current, checked: nextChecked } : current
		);
		try {
			await updateItem(listId, item.id, { checked: nextChecked });
			void refreshBadgeCount();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update item.';
			void loadAll();
		}
	}

	// Fires once, on release, with the dragged item's new immediate
	// neighbors (see sortable-reorder.ts) — `sortOrder` is derived from
	// *their* real sortOrder values (fractional indexing), never from a flat
	// position. A flat index collides with whatever other item already had
	// that value (everything gets its sortOrder from an ever-increasing
	// per-list counter at creation time — see items_controller.ts's
	// `nextSortOrder`), and since SQLite doesn't define a tiebreak for equal
	// `ORDER BY sortOrder` values, a collision could silently reshuffle the
	// list on the next load even though nothing else changed.
	async function handleItemDrop(params: {
		itemId: number;
		toContainerId: number | null;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const draggedItem = items.find((current) => current.id === params.itemId);
		// The dragged row is always still present at drop time — nothing
		// mutates `items` mid-gesture.
		/* v8 ignore next */
		if (!draggedItem) return;

		const withoutDragged = items.filter((current) => current.id !== draggedItem.id);
		const beforeItem = withoutDragged.find((current) => current.id === params.beforeItemId);
		const afterItem = withoutDragged.find((current) => current.id === params.afterItemId);
		const insertAt = beforeItem
			? withoutDragged.indexOf(beforeItem) + 1
			: afterItem
				? withoutDragged.indexOf(afterItem)
				: withoutDragged.length;
		const newSortOrder = computeMidpointSortOrder(beforeItem?.sortOrder, afterItem?.sortOrder);

		// Reassigns categoryId when the drop lands in a different section —
		// matching AnyList's drag-to-recategorize.
		const updatedItem: ItemDto = {
			...draggedItem,
			categoryId: params.toContainerId,
			sortOrder: newSortOrder
		};

		withoutDragged.splice(insertAt, 0, updatedItem);
		items = withoutDragged;

		try {
			await updateItem(listId, draggedItem.id, {
				categoryId: updatedItem.categoryId,
				sortOrder: newSortOrder
			});
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to reorder item.';
			void loadAll();
		}
	}

	async function removeItem(item: ItemDto) {
		items = items.filter((current) => current.id !== item.id);
		try {
			await deleteItem(listId, item.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete item.';
			void loadAll();
		}
	}

	// Bulk-deletes via the same soft-delete path as a single item, one request
	// per item rather than a new backend endpoint (PHASE10_PLAN.md #0.11) — each
	// call targets a different id, so there's no version-conflict risk running
	// them concurrently, and it inherits the offline-queue behavior for free.
	async function clearChecked() {
		confirmAction = null;
		await Promise.all(checkedItems.map((item) => removeItem(item)));
	}

	// Bulk-unchecks every checked item, optimistic in-memory first then one
	// update request per item — same shape as `clearChecked`, but reusing the
	// single-item update path (and its offline queue) instead of deleting.
	async function uncheckAllItems() {
		confirmAction = null;
		const toUncheck = items.filter((item) => item.checked);
		items = items.map((item) => (item.checked ? { ...item, checked: false } : item));
		try {
			await Promise.all(toUncheck.map((item) => updateItem(listId, item.id, { checked: false })));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update item.';
			void loadAll();
		}
	}

	// Bulk-deletes every item on the list, checked or not — deliberately NOT
	// scoped to the currently-selected store's visible items (unlike the
	// checked-item actions); "ALL" means all.
	async function clearAllItems() {
		confirmAction = null;
		await Promise.all(items.map((item) => removeItem(item)));
	}

	function handleConfirm() {
		if (confirmAction === 'clearChecked') void clearChecked();
		if (confirmAction === 'uncheckAll') void uncheckAllItems();
		if (confirmAction === 'clearAll') void clearAllItems();
	}
</script>

<svelte:head>
	<title>{list ? `${list.name} — EveryList` : 'List — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 px-8 pb-8">
	<div
		class="sticky top-0 z-20 flex flex-col gap-4 bg-paper pt-[max(env(safe-area-inset-top),2rem)]"
		style="touch-action: pan-x pan-y;"
		bind:clientHeight={stickyHeaderHeight}
	>
		<PageHeader title={list?.name} backHref={resolve('/lists')} backLabel="My Lists">
			{#snippet actions()}
				<a
					href={resolve('/lists/[id]/stores', { id: String(listId) })}
					aria-label="Stores"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
				>
					<span style:color={selectedStore?.color}>
						<Icon name="store" class="h-5 w-5" />
					</span>
				</a>
				<PopoutMenu label="List menu" iconName="dotsVertical">
					{#snippet children(close)}
						<button
							type="button"
							disabled={checkedItems.length === 0}
							onclick={() => {
								confirmAction = 'clearChecked';
								close();
							}}
							class="block w-full rounded px-2 py-1.5 text-left text-sm whitespace-nowrap text-primary-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-400 dark:hover:bg-gray-700"
						>
							Clear Checked Off Items
						</button>
						<button
							type="button"
							disabled={checkedItems.length === 0}
							onclick={() => {
								confirmAction = 'uncheckAll';
								close();
							}}
							class="block w-full rounded px-2 py-1.5 text-left text-sm whitespace-nowrap text-primary-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-400 dark:hover:bg-gray-700"
						>
							Uncheck All Items
						</button>
						<button
							type="button"
							disabled={items.length === 0}
							onclick={() => {
								confirmAction = 'clearAll';
								close();
							}}
							class="block w-full rounded px-2 py-1.5 text-left text-sm whitespace-nowrap text-primary-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-400 dark:hover:bg-gray-700"
						>
							Clear ALL List Items
						</button>
						<a
							href={resolve('/lists/[id]/settings', { id: String(listId) })}
							class="mt-1 block rounded border-t border-gray-200 px-2 pt-2 text-sm whitespace-nowrap text-primary-700 hover:bg-gray-100 dark:border-gray-700 dark:text-primary-400 dark:hover:bg-gray-700"
						>
							List Settings
						</a>
					{/snippet}
				</PopoutMenu>
			{/snippet}
		</PageHeader>

		{#snippet pasteIcon()}
			<a
				href={resolve('/lists/[id]/import', { id: String(listId) })}
				aria-label="Paste in a list"
				class="pointer-events-auto flex h-6 w-6 items-center justify-center transition-opacity {itemInputFocused
					? 'opacity-100'
					: 'pointer-events-none opacity-0'}"
			>
				<Icon name="clipboardText" class="h-5 w-5" />
			</a>
		{/snippet}

		{#if list && !(list.passcodeHash && !unlocked)}
			<form class="flex items-center gap-2 print:hidden" onsubmit={handleAddItem}>
				<div
					class="flex shrink-0 items-center gap-2 overflow-hidden transition-all duration-200 {itemInputFocused
						? 'pointer-events-none max-w-0 opacity-0'
						: 'max-w-28 opacity-100'}"
				>
					<a
						href={resolve('/lists/[id]/favorites', { id: String(listId) })}
						aria-label="Favorites"
						class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-600 dark:text-gray-400"
					>
						<Icon name="heart" class="h-5 w-5" />
					</a>
					<a
						href={resolve('/lists/[id]/recently-deleted', { id: String(listId) })}
						aria-label="Recently deleted"
						class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-600 dark:text-gray-400"
					>
						<Icon name="history" class="h-5 w-5" />
					</a>
				</div>
				<ItemAutocomplete
					{listId}
					bind:value={newItemName}
					existingNames={items.map((item) => item.name)}
					onselect={(name) => void addItem(name)}
					onfocuschange={(focused) => (itemInputFocused = focused)}
					right={pasteIcon}
				/>
				<div
					class="flex shrink-0 items-center overflow-hidden transition-all duration-200 {itemInputFocused
						? 'max-w-0 opacity-0'
						: 'max-w-11 opacity-100'}"
				>
					<button
						type="button"
						aria-label={showChecked ? 'Hide checked items' : 'Show checked items'}
						onclick={() => {
							showChecked = !showChecked;
							setShowChecked(listId, showChecked);
						}}
						class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-600 dark:text-gray-400"
					>
						<Icon name={showChecked ? 'eyeOutline' : 'eyeOffOutline'} class="h-5 w-5" />
					</button>
				</div>
			</form>
		{/if}
	</div>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		{#if list.passcodeHash && !unlocked}
			<PasscodeGate {list} onunlock={() => (unlocked = true)} />
		{:else}
			{#if confirmMessage}
				<div
					class="flex items-center justify-between gap-2 rounded-lg border border-red-200 p-3 text-sm dark:border-red-900 print:hidden"
				>
					<p class="text-red-600 dark:text-red-400">{confirmMessage}</p>
					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							class="rounded-lg bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
							onclick={handleConfirm}
						>
							Confirm
						</button>
						<button
							type="button"
							class="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
							onclick={() => (confirmAction = null)}
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			{#if error}
				<p class="text-sm text-red-600 dark:text-red-400 print:hidden">{error}</p>
			{/if}

			{#if items.length === 0}
				<div class="flex flex-col items-center gap-2 py-8 text-center">
					<span style:color={list.color}>
						<Icon name={list.icon ?? 'formatListChecks'} class="h-10 w-10" />
					</span>
					<p class="text-gray-600 dark:text-gray-400">
						Nothing here yet. Add your first item above.
					</p>
				</div>
			{:else if visibleItems.length === 0}
				<div
					class="flex flex-col items-center gap-2 py-8 text-center text-gray-400 dark:text-gray-500"
				>
					<Icon name="filterOutline" class="h-8 w-8" />
					<p class="text-sm">
						{`No items are tagged for ${selectedStore!.name}. Change which items are shown from the store icon above to see the rest of this list.`}
					</p>
				</div>
			{:else}
				<div class="flex flex-col gap-6 pb-16">
					{#each groups as group (group.category?.id ?? 'uncategorized')}
						<section>
							{#if list.useCategories !== false}
								<h2
									class="sticky z-10 mb-2 flex items-center gap-2 border-b bg-paper pb-1 text-sm font-semibold {group.category
										? ''
										: 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400'}"
									use:stickyTop={stickyHeaderHeight}
									style:touch-action="pan-x pan-y"
									style:color={group.category ? list.color : undefined}
									style:border-bottom-color={group.category ? list.color : undefined}
								>
									{#if group.category}
										<Icon name={group.category.icon} class="h-4 w-4" />
									{/if}
									<span>
										{group.category?.name ?? 'Uncategorized'}
									</span>
								</h2>
							{/if}
							<ul
								class="flex flex-col gap-1"
								data-container-id={group.category?.id ?? 'null'}
								use:sortableReorder={{ group: 'list-items', onDrop: handleItemDrop }}
							>
								{#each group.items as item (item.id)}
									<li class="relative overflow-hidden rounded-lg" data-item-id={item.id}>
										<div
											class="absolute inset-y-0 left-0 flex w-20 items-center justify-center bg-red-600 text-white print:hidden"
											aria-hidden="true"
										>
											<Icon name="trashCanOutline" class="h-5 w-5" />
										</div>
										<div
											class="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-blue-600 text-white print:hidden"
											aria-hidden="true"
										>
											<Icon name="pencil" class="h-5 w-5" />
										</div>
										<div
											class="item-row relative flex items-center gap-2 bg-paper {highlightedItemId ===
											item.id
												? 'item-row-highlight'
												: ''}"
											style="touch-action: pan-y;"
											use:swipeReveal={{
												disabled: !isCoarsePointer,
												onCommitRight: () => removeItem(item),
												onCommitLeft: () =>
													goto(
														resolve('/lists/[id]/items/[itemId]', {
															id: String(listId),
															itemId: String(item.id)
														})
													)
											}}
										>
											<button
												type="button"
												role="checkbox"
												aria-checked={item.checked}
												aria-label={item.name}
												data-reorder-ignore
												onclick={() => toggleChecked(item)}
												class="check-glyph flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 {item.checked
													? 'border-signal bg-signal'
													: 'border-gray-300 bg-transparent dark:border-gray-600'}"
											>
												{#if item.checked}
													<svg
														class="h-3.5 w-3.5 text-white"
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														stroke-width="2.5"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
													>
														<path d="M3 8.5l3.2 3.2L13 4.5" />
													</svg>
												{/if}
											</button>
											<div
												class="item-name flex flex-1 flex-col"
												style="touch-action: manipulation; -webkit-touch-callout: none;"
											>
												<div class="flex items-center gap-2">
													<span class={item.checked ? 'text-gray-400 line-through' : ''}>
														{item.name}
													</span>
													{#if item.quantity}
														<span class="text-gray-600 dark:text-gray-400"
															>(<span>{item.quantity}</span>)</span
														>
													{/if}
												</div>
												{#if item.storeId}
													{@const itemStore = stores.find((store) => store.id === item.storeId)}
													{#if itemStore}
														<span class="text-xs" style:color={itemStore.color}>
															{itemStore.name}
														</span>
													{/if}
												{/if}
											</div>
											{#if !isCoarsePointer}
												<span
													aria-hidden="true"
													class="ml-auto flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 dark:text-gray-600"
												>
													<Icon name="dragVertical" class="h-5 w-5" />
												</span>
												<a
													href={resolve('/lists/[id]/items/[itemId]', {
														id: String(listId),
														itemId: String(item.id)
													})}
													aria-label={`Edit ${item.name}`}
													data-reorder-ignore
													class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 print:hidden"
												>
													<Icon name="pencil" class="h-5 w-5" />
												</a>
												<button
													type="button"
													aria-label={`Delete ${item.name}`}
													data-reorder-ignore
													class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-red-600 dark:hover:text-red-400 print:hidden"
													onclick={() => removeItem(item)}
												>
													<Icon name="close" class="h-5 w-5" />
												</button>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>

				<div
					class="fixed inset-x-4 z-10 mx-auto flex max-w-lg items-center justify-between rounded-t-xl border border-b-0 border-gray-200 bg-paper px-4 py-2 text-sm shadow-sm dark:border-gray-700 print:hidden"
					style="bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));"
				>
					<span class="text-gray-600 dark:text-gray-400">
						{progressText}
					</span>
					{#if totalCents > 0}
						<span class="font-mono font-semibold tabular-nums">{totalText}</span>
					{/if}
				</div>
			{/if}
		{/if}
	{:else}
		<!-- Reachable only once loadAll's finally has run: loading is false, and
		     its catch always sets `error` when it leaves `list` unset. -->
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>

<style>
	/* SortableJS applies these classes to the dragged row (chosenClass while
	   held, dragClass while its fallback element is moving) — the
	   box-shadow/elevation would otherwise be clipped by this li's own
	   overflow-hidden, which exists only to mask the swipe-reveal panels. */
	:global(li.sortable-chosen),
	:global(li.sortable-drag) {
		overflow: visible;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
		z-index: 5;
	}

	/* The placeholder left in the source slot while dragging. */
	:global(li.sortable-ghost) {
		opacity: 0.4;
	}

	.item-row {
		min-height: 3.5rem;
		padding-block: 0.5rem;
		transition: background-color 600ms ease-out;
	}

	/* A tap on the item name can trigger the browser's native
	   text-selection/copy menu on mobile instead of registering as a tap —
	   same fix as .header-title in PageHeader.svelte. */
	.item-name {
		user-select: none;
		-webkit-user-select: none;
	}

	.item-row-highlight {
		/* Mixed against the opaque paper background, not "transparent" — this row
		   sits in front of the swipe-reveal delete/edit panels (absolutely
		   positioned behind it), which a translucent highlight would let show
		   through underneath. */
		background-color: color-mix(in srgb, var(--color-primary-500) 25%, var(--color-paper) 75%);
		transition: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.check-glyph[aria-checked='true'] svg {
			animation: check-settle 180ms ease-out;
		}
	}

	@keyframes check-settle {
		0% {
			transform: scale(0.5);
			opacity: 0;
		}
		60% {
			transform: scale(1.15);
			opacity: 1;
		}
		100% {
			transform: scale(1);
		}
	}
</style>
