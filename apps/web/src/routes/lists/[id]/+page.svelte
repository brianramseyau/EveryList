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
	import { getSelectedStore } from '$lib/api/selected-store';
	import { isRowDirty } from '$lib/offline/db';
	import { ApiError } from '$lib/api/client';
	import { subscribeToList } from '$lib/realtime';
	import { refreshBadgeCount } from '$lib/pwa/badge';
	import { isListUnlocked } from '$lib/passcode';
	import { getShowChecked, setShowChecked } from '$lib/list-prefs';
	import { pressHoldReorder } from '$lib/actions/press-hold-reorder';
	import { swipeReveal } from '$lib/actions/swipe-reveal';
	import Icon from '$lib/components/Icon.svelte';
	import ItemAutocomplete from '$lib/components/ItemAutocomplete.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PasscodeGate from '$lib/components/PasscodeGate.svelte';
	import SyncToast from '$lib/components/SyncToast.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let unlocked = $state(false);
	let categories = $state<CategoryDto[]>([]);
	let items = $state<ItemDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	// The store currently "shopping at" (PHASE10_PLAN.md #0.5) — local/device-only,
	// see $lib/api/selected-store.ts. Drives both the item filter and the header
	// store icon's color, replacing the old separate "All stores" dropdown.
	let selectedStoreId = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newItemName = $state('');
	let adding = $state(false);

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

	// Checked items stay under their category header instead of moving to a
	// separate section (PHASE9_PLAN.md #3) — this toggle controls whether
	// they're visible at all, defaulting to shown. Persisted per list/device
	// via $lib/list-prefs so it survives reload and revisiting the list.
	let showChecked = $state(true);

	let syncToastVisible = $state(false);
	let unsubscribeRealtime: (() => void) | null = null;

	// Coarse (touch) pointers get the swipe-to-delete gesture; fine pointers
	// (mouse/trackpad) get a static "×" fallback instead (PHASE9_PLAN.md #9)
	// — checked once on mount since input capability doesn't change mid-session.
	let isCoarsePointer = $state(false);

	// Store-specific aisle order, if the shopper has picked a store for this
	// list on this device — purely local, see $lib/api/selected-store.ts.
	let storeCategoryOverrides: Map<number, number> = new SvelteMap();

	const selectedStore = $derived(stores.find((store) => store.id === selectedStoreId) ?? null);

	// Only filter once selectedStoreId resolves to a store that's actually still
	// on this list — a stale/orphaned id (e.g. a store removed outside the normal
	// flow) must behave like "no store selected" rather than silently hiding
	// every item with no way to clear it from this screen.
	const visibleItems = $derived(
		selectedStore === null ? items : items.filter((item) => item.storeId === selectedStore.id)
	);

	const groups = $derived.by(() => {
		const byCategory = new SvelteMap<number | null, ItemDto[]>();
		for (const item of visibleItems) {
			if (item.checked && !showChecked) continue;
			const key = item.categoryId;
			if (!byCategory.has(key)) byCategory.set(key, []);
			byCategory.get(key)!.push(item);
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

	// Flat, cross-category index of each item as currently rendered — drag
	// targets are computed against this single flat ordering (PHASE9_PLAN.md
	// #7), so dragging past a category's last row naturally crosses into the
	// next section.
	const flatIndexById = $derived.by(() => {
		const map = new SvelteMap<number, number>();
		groups.flatMap((group) => group.items).forEach((item, index) => map.set(item.id, index));
		return map;
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

			selectedStoreId = await getSelectedStore(listId);
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
			// An unacked local edit on this exact row means the eventual flush response is
			// authoritative, not this racing broadcast — suppress it (see PHASE5_PLAN.md §4).
			void isRowDirty(event.entityType, event.entityId).then((dirty) => {
				if (!dirty) syncToastVisible = true;
			});
		});
	});

	onDestroy(() => {
		unsubscribeRealtime?.();
		if (highlightTimeout) clearTimeout(highlightTimeout);
	});

	function refreshFromSync() {
		syncToastVisible = false;
		void loadAll();
	}

	async function addItem(rawName: string) {
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

	let itemsContainerEl: HTMLDivElement | undefined = $state();

	function getItemRowEls(): HTMLElement[] {
		// Only reachable before the item list has ever rendered — the drag
		// this feeds doesn't exist yet either, so it can't be exercised.
		/* v8 ignore next */
		if (!itemsContainerEl) return [];
		return [...itemsContainerEl.querySelectorAll('li')];
	}

	// Fires once, on release — dragging itself never touches `items` (see
	// press-hold-reorder.ts). `toIndex` is already a final, length-preserving
	// index (the row this item lands at, once removed from `fromIndex`).
	async function handleItemDrop(fromIndex: number, toIndex: number) {
		const flat = groups.flatMap((group) => group.items);
		const draggedItem = flat[fromIndex];
		// The dragged row is always still present at drop time — nothing
		// mutates `items` mid-gesture.
		/* v8 ignore next */
		if (!draggedItem) return;

		const targetNeighbor = flat.filter((_, index) => index !== fromIndex)[toIndex] ?? null;
		const targetCategoryId = targetNeighbor
			? targetNeighbor.categoryId
			: (groups.at(-1)?.category?.id ?? null);

		// Reassigns categoryId when the drop lands in a different section —
		// matching AnyList's drag-to-recategorize.
		const updatedItem: ItemDto =
			draggedItem.categoryId === targetCategoryId
				? draggedItem
				: { ...draggedItem, categoryId: targetCategoryId };

		const withoutDragged = items.filter((current) => current.id !== draggedItem.id);
		const neighborIndexInItems = targetNeighbor
			? withoutDragged.findIndex((current) => current.id === targetNeighbor.id)
			: -1;
		const insertAt = neighborIndexInItems === -1 ? withoutDragged.length : neighborIndexInItems;
		withoutDragged.splice(insertAt, 0, updatedItem);
		items = withoutDragged;

		try {
			await updateItem(listId, draggedItem.id, {
				categoryId: updatedItem.categoryId,
				sortOrder: toIndex
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
		await Promise.all(checkedItems.map((item) => removeItem(item)));
	}
</script>

<svelte:head>
	<title>{list ? `${list.name} — EveryList` : 'List — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<div class="sticky top-0 z-20 bg-paper pt-[env(safe-area-inset-top)]">
		<PageHeader title={list?.name} backHref={resolve('/lists')} backLabel="My Lists">
			{#snippet actions()}
				<a
					href={resolve('/lists/[id]/favorites', { id: String(listId) })}
					aria-label="Favorites"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
				>
					<Icon name="heart" class="h-5 w-5" />
				</a>
				<a
					href={resolve('/lists/[id]/recently-deleted', { id: String(listId) })}
					aria-label="Recently deleted"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
				>
					<Icon name="history" class="h-5 w-5" />
				</a>
				<a
					href={resolve('/lists/[id]/stores', { id: String(listId) })}
					aria-label="Stores"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
				>
					<span style:color={selectedStore?.color}>
						<Icon name="store" class="h-5 w-5" />
					</span>
				</a>
				<a
					href={resolve('/lists/[id]/settings', { id: String(listId) })}
					aria-label="List settings"
					class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
				>
					<Icon name="cog" class="h-5 w-5" />
				</a>
			{/snippet}
		</PageHeader>
	</div>

	<div class="print:hidden">
		<SyncToast
			visible={syncToastVisible}
			onrefresh={refreshFromSync}
			ondismiss={() => (syncToastVisible = false)}
		/>
	</div>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		{#if list.passcodeHash && !unlocked}
			<PasscodeGate {list} onunlock={() => (unlocked = true)} />
		{:else}
			<form class="flex items-center gap-2 print:hidden" onsubmit={handleAddItem}>
				<a
					href={resolve('/lists/[id]/import', { id: String(listId) })}
					aria-label="Paste in a list"
					class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-600 dark:text-gray-400"
				>
					<Icon name="clipboardText" class="h-5 w-5" />
				</a>
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
				{#if checkedItems.length > 0}
					<button
						type="button"
						aria-label="Clear checked items"
						onclick={() => void clearChecked()}
						class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-600 dark:text-gray-400"
					>
						<Icon name="deleteSweep" class="h-5 w-5" />
					</button>
				{/if}
				<ItemAutocomplete
					{listId}
					bind:value={newItemName}
					existingNames={items.map((item) => item.name)}
					onselect={(name) => void addItem(name)}
				/>
				<button
					type="submit"
					aria-label="Add item"
					disabled={adding || !newItemName.trim()}
					class="flex h-11 w-11 shrink-0 items-center justify-center text-primary-600 disabled:opacity-30 dark:text-primary-400"
				>
					<Icon name="plusCircle" class="h-7 w-7" />
				</button>
			</form>

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
						{`No items are tagged for ${selectedStore!.name}. Change the store you're shopping at from the store icon above to see the rest of this list.`}
					</p>
				</div>
			{:else}
				<div class="flex flex-col gap-6 pb-16" bind:this={itemsContainerEl}>
					{#each groups as group (group.category?.id ?? 'uncategorized')}
						<section>
							<h2
								class="mb-2 flex items-center gap-2 border-b pb-1 text-sm font-semibold {group.category
									? ''
									: 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400'}"
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
							<ul class="flex flex-col gap-1">
								{#each group.items as item (item.id)}
									<li
										class="relative overflow-hidden rounded-lg"
										use:pressHoldReorder={{
											index: flatIndexById.get(item.id)!,
											getRowEls: getItemRowEls,
											ondrop: handleItemDrop
										}}
									>
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
														<span class="text-xs text-gray-500 dark:text-gray-400">
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
	/* The dragged row's own box-shadow/elevation (applied inline by
	   press-hold-reorder.ts) would otherwise be clipped by this li's own
	   overflow-hidden, which exists only to mask the swipe-reveal panels. */
	:global(li.is-dragging) {
		overflow: visible;
	}

	.item-row {
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
