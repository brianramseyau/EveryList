<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { CategoryDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { emailExportList, fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { fetchCategoryLearnings } from '$lib/api/category-learnings';
	import { createItem, deleteItem, fetchItems, updateItem } from '$lib/api/items';
	import { fetchStoreCategoryOrder, fetchStores } from '$lib/api/stores';
	import { getSelectedStoreSettings, setSelectedStoreSettings } from '$lib/api/selected-store';
	import { isRowDirty, type StoreFilter } from '$lib/offline/db';
	import { isSelfMutation } from '$lib/offline/self-mutations';
	import { ApiError } from '$lib/api/client';
	import { subscribeToList } from '$lib/realtime';
	import { onConflict, onFlushOutcome } from '$lib/offline/flush';
	import { refreshBadgeCount } from '$lib/pwa/badge';
	import { getShowChecked, setShowChecked } from '$lib/list-prefs';
	import { sortableReorder } from '$lib/actions/sortable-reorder';
	import { longPress } from '$lib/actions/long-press';
	import { anchorPanel } from '$lib/actions/anchor-panel';
	import { computeMidpointSortOrder } from '$lib/item-sort-order';
	import { swipeReveal } from '$lib/actions/swipe-reveal';
	import { splitTextWithLinks } from '$lib/linkify';
	import Icon from '$lib/components/Icon.svelte';
	import ItemAutocomplete from '$lib/components/ItemAutocomplete.svelte';
	import NoteLink from '$lib/components/NoteLink.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PasscodeGate from '$lib/components/PasscodeGate.svelte';
	import PopoutMenu from '$lib/components/PopoutMenu.svelte';
	import PopoutMenuItem from '$lib/components/PopoutMenuItem.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	// Not persisted anywhere — only lives for as long as this page stays mounted
	// and foregrounded. Navigating away (e.g. back to the lists page), the tab
	// going to the background, or closing the app all drop it, so the passcode
	// is required again next time (see the `visibilitychange` handling below).
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

	// Ellipses menu's "Share" panel state — swapped in place of the main menu
	// items rather than a separate nested PopoutMenu, so the same click-outside/
	// Escape handling covers both views. Reset via resetShareState() whenever
	// the menu itself closes, so reopening it doesn't resurrect an in-progress
	// email form or "Copied!" flash from the last time it was open.
	let shareView = $state(false);
	let exportingEmail = $state(false);
	let exportEmail = $state('');
	let exportStatus = $state<'idle' | 'sent' | 'error'>('idle');
	let exportErrorMessage = $state('');
	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	// Measured height of the pinned header (title bar + item entry field), fed
	// by PageHeader's `fixed` mode — used both to stick category headings just
	// beneath it and to pad the scrollable content below it. Seeded to 144
	// (the old static `pt-36`) so first paint looks right before PageHeader's
	// own clientHeight measurement corrects it.
	let stickyHeaderHeight = $state(144);

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
	//
	// Tucked 1px up under the fixed header (its measured height minus one)
	// rather than butting flush against it: on Android/Blink the header and the
	// sticky heading are rasterized on separate compositor layers, and their
	// shared edge rounds to different device-pixel boundaries during a fling,
	// leaving a 1–2px seam where scrolled item text shows through (not seen on
	// desktop or iOS). The header is opaque and z-20 above the heading's z-10,
	// so the 1px overlap is hidden behind it and simply closes the seam.
	function stickyTop(node: HTMLElement, top: number) {
		node.style.top = `${top - 1}px`;
		return {
			update(newTop: number) {
				node.style.top = `${newTop - 1}px`;
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

	// Long-press quick-select on the header store icon (a lightweight store
	// switcher that skips the full stores screen). `storeMenuOpen` is the
	// panel's open state; `storeMenuAnchor`/`storeMenuContainer` are the refs
	// the panel is positioned against and the click-outside check keys on.
	let storeMenuOpen = $state(false);
	let storeMenuContainer: HTMLDivElement | undefined = $state();
	let storeMenuAnchor: HTMLAnchorElement | undefined = $state();

	function handleStoreMenuWindowClick(event: MouseEvent) {
		if (!storeMenuOpen || !storeMenuContainer) return;
		// Same composedPath() rationale as PopoutMenu: captured at dispatch
		// time so a menu item swapping its own DOM still reads as "inside".
		if (!event.composedPath().includes(storeMenuContainer)) storeMenuOpen = false;
	}

	function handleStoreMenuWindowKeydown(event: KeyboardEvent) {
		if (storeMenuOpen && event.key === 'Escape') storeMenuOpen = false;
	}

	async function selectStore(storeId: number | null) {
		storeMenuOpen = false;
		if (storeId === selectedStoreId) return;
		selectedStoreId = storeId;
		await setSelectedStoreSettings(listId, { storeId, filter: storeFilter });
		storeCategoryOverrides.clear();
		if (storeId !== null) {
			for (const entry of await fetchStoreCategoryOrder(storeId)) {
				storeCategoryOverrides.set(entry.categoryId, entry.sortOrder);
			}
		}
	}

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
		// Only the very first load (before `list` exists) should show the loading
		// placeholder — it unmounts the entire keyed item list below, which resets
		// scroll position. Realtime/conflict/flush-outcome refreshes reuse this same
		// function while `list` is already populated, and must patch state in place
		// instead of tearing the DOM down and rebuilding it under the user.
		if (!list) loading = true;
		try {
			[list, categories, items, stores] = await Promise.all([
				fetchList(listId),
				fetchCategories(listId),
				fetchItems(listId),
				fetchStores(listId)
			]);
			// Warm the read-only learned-model cache for this list's offline
			// suggestion fallback (PHASE17_PLAN.md) — non-blocking, so a failure
			// here doesn't fail the page load.
			void fetchCategoryLearnings(listId);

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

	// Backgrounding the app/tab re-locks a passcode-protected list even though
	// this page stays mounted — leaving/closing already re-locks it for free
	// since `unlocked` is plain, unpersisted component state that starts false
	// on every fresh mount.
	function lockOnHide() {
		if (document.hidden) unlocked = false;
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
		showChecked = getShowChecked(listId);
		document.addEventListener('visibilitychange', lockOnHide);
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
		document.removeEventListener('visibilitychange', lockOnHide);
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

	function resetShareState() {
		shareView = false;
		exportingEmail = false;
		exportEmail = '';
		exportStatus = 'idle';
		exportErrorMessage = '';
		copied = false;
	}

	// AnyList's own bulk-export text format (category headers in ALL CAPS,
	// bulleted items below), so a copied list round-trips through this app's
	// paste-import (see bulk_import_parser.ts) as cleanly as an AnyList export
	// does. Always unchecked items, regardless of the selected-store filter or
	// the showChecked toggle — sharing means "what's left to get."
	function buildShareText(): string {
		const unchecked = items.filter((item) => !item.checked);
		const byCategory = new SvelteMap<number | null, ItemDto[]>();
		for (const item of unchecked) {
			const key = item.categoryId;
			if (!byCategory.has(key)) byCategory.set(key, []);
			byCategory.get(key)!.push(item);
		}

		const lines: string[] = [list!.name, ''];
		const appendSection = (header: string | null, sectionItems: ItemDto[]) => {
			if (sectionItems.length === 0) return;
			if (header) lines.push(header.toUpperCase());
			for (const item of sectionItems) {
				const quantity = item.quantity ? ` (${item.quantity})` : '';
				lines.push(`• ${item.name}${quantity}`);
			}
			lines.push('');
		};

		if (list!.useCategories === false) {
			appendSection(null, unchecked);
		} else {
			const orderedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
			for (const category of orderedCategories) {
				appendSection(category.name, byCategory.get(category.id) ?? []);
			}
			appendSection(null, byCategory.get(null) ?? []);
		}

		return lines.join('\n').trimEnd();
	}

	async function copyListToClipboard() {
		try {
			await navigator.clipboard.writeText(buildShareText());
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// Clipboard access can be denied by the browser — there's no
			// server round-trip to retry, so this is a nice-to-have, not fatal.
		}
	}

	function printList(close: () => void) {
		close();
		// The popout panel is only in the DOM while `open` (see PopoutMenu),
		// and closing it clears that synchronously — but Svelte's own DOM
		// update from that state change hasn't flushed yet, so print
		// immediately would still capture the menu. Defer one tick.
		setTimeout(() => window.print(), 0);
	}

	async function sendEmailExport(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = exportEmail.trim();
		if (!trimmed) return;
		exportStatus = 'idle';
		try {
			await emailExportList(listId, trimmed);
			exportStatus = 'sent';
			exportEmail = '';
		} catch (err) {
			exportStatus = 'error';
			exportErrorMessage = err instanceof ApiError ? err.message : 'Failed to send export.';
		}
	}
</script>

<svelte:window onclick={handleStoreMenuWindowClick} onkeydown={handleStoreMenuWindowKeydown} />

<main class="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-8">
	<PageHeader
		title={list?.name}
		htmlTitle={list ? list.name : 'List'}
		backHref={resolve('/lists')}
		backLabel="My Lists"
		fixed
		bind:height={stickyHeaderHeight}
	>
		{#snippet actions()}
			<div class="relative" bind:this={storeMenuContainer}>
				<a
					href={resolve('/lists/[id]/stores', { id: String(listId) })}
					aria-label="Stores"
					bind:this={storeMenuAnchor}
					oncontextmenu={(event) => event.preventDefault()}
					class="store-trigger text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
					use:longPress={{
						disabled: stores.length === 0,
						onLongPress: () => (storeMenuOpen = true)
					}}
				>
					<span style:color={selectedStore?.color}>
						<Icon name="store" class="h-5 w-5" />
					</span>
				</a>

				{#if storeMenuOpen && storeMenuAnchor}
					<div
						use:anchorPanel={storeMenuAnchor}
						class="fixed z-30 min-w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
					>
						<PopoutMenuItem onclick={() => selectStore(null)}>
							<span class="flex items-center gap-2">
								<span class="flex-1">No store selected</span>
								{#if selectedStoreId === null}
									<Icon name="checkCircle" class="h-5 w-5 shrink-0 text-primary-600" />
								{/if}
							</span>
						</PopoutMenuItem>
						{#each stores as store (store.id)}
							<PopoutMenuItem onclick={() => selectStore(store.id)}>
								<span class="flex items-center gap-2">
									<span
										class="h-3.5 w-3.5 shrink-0 rounded-full"
										style:background-color={store.color}
										aria-hidden="true"
									></span>
									<span class="flex-1">{store.name}</span>
									{#if selectedStoreId === store.id}
										<Icon name="checkCircle" class="h-5 w-5 shrink-0 text-primary-600" />
									{/if}
								</span>
							</PopoutMenuItem>
						{/each}
					</div>
				{/if}
			</div>
			<PopoutMenu
				label="List menu"
				iconName="dotsVertical"
				onOpenChange={(isOpen) => {
					if (!isOpen) resetShareState();
				}}
			>
				{#snippet children(close)}
					{#if shareView}
						<div
							class="mb-1 flex items-center gap-1 border-b border-gray-200 pb-1.5 dark:border-gray-700"
						>
							<button
								type="button"
								aria-label="Back to list menu"
								onclick={() => (shareView = false)}
								class="flex h-8 w-8 items-center justify-center rounded text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
							>
								<Icon name="chevronLeft" class="h-5 w-5" />
							</button>
							<span class="text-sm font-semibold text-gray-600 dark:text-gray-400">Share</span>
						</div>
						<PopoutMenuItem onclick={() => printList(close)}>Print list</PopoutMenuItem>
						<PopoutMenuItem onclick={copyListToClipboard}>
							{copied ? 'Copied!' : 'Copy to Clipboard'}
						</PopoutMenuItem>
						{#if exportingEmail}
							<form class="flex flex-col gap-2 px-3 py-2.5" onsubmit={sendEmailExport}>
								<Input
									type="email"
									placeholder="you@example.com"
									bind:value={exportEmail}
									required
								/>
								<div class="flex items-center gap-2">
									<Button type="submit" size="sm" disabled={!exportEmail.trim()}>Send</Button>
									<Button
										type="button"
										size="sm"
										color="alternative"
										onclick={() => (exportingEmail = false)}
									>
										Cancel
									</Button>
								</div>
								{#if exportStatus === 'sent'}
									<p class="text-xs text-green-600 dark:text-green-400">Export sent.</p>
								{:else if exportStatus === 'error'}
									<p class="text-xs text-red-600 dark:text-red-400">{exportErrorMessage}</p>
								{/if}
							</form>
						{:else}
							<PopoutMenuItem onclick={() => (exportingEmail = true)}>Email export…</PopoutMenuItem>
						{/if}
					{:else}
						<PopoutMenuItem
							disabled={checkedItems.length === 0}
							onclick={() => {
								confirmAction = 'clearChecked';
								close();
							}}
						>
							Clear Checked Off Items
						</PopoutMenuItem>
						<PopoutMenuItem
							disabled={checkedItems.length === 0}
							onclick={() => {
								confirmAction = 'uncheckAll';
								close();
							}}
						>
							Uncheck All Items
						</PopoutMenuItem>
						<PopoutMenuItem
							disabled={items.length === 0}
							onclick={() => {
								confirmAction = 'clearAll';
								close();
							}}
						>
							Clear ALL List Items
						</PopoutMenuItem>
						<PopoutMenuItem divider onclick={() => (shareView = true)}>Share</PopoutMenuItem>
						<PopoutMenuItem href={resolve('/lists/[id]/settings', { id: String(listId) })}>
							List Settings
						</PopoutMenuItem>
					{/if}
				{/snippet}
			</PopoutMenu>
		{/snippet}
		{#snippet extra()}
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
		{/snippet}
	</PageHeader>

	<div style:padding-top={`${stickyHeaderHeight}px`}>
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
					<div class="flex flex-col gap-2 pb-16">
						{#each groups as group (group.category?.id ?? 'uncategorized')}
							<section>
								{#if list.useCategories !== false}
									<h2
										class="sticky z-10 mb-1 flex items-center gap-2 border-b bg-paper pb-1 text-sm font-semibold {group.category
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
									use:sortableReorder={{
										group: 'list-items',
										fallbackAxis: 'y',
										onDrop: handleItemDrop
									}}
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
														),
													onTap: () => void toggleChecked(item)
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
													class="item-name flex min-w-0 flex-1 flex-col"
													style="touch-action: manipulation; -webkit-touch-callout: none;"
												>
													<div class="flex min-w-0 items-center gap-2">
														<span
															class="wrap-anywhere {item.checked
																? 'text-gray-400 line-through'
																: ''}"
														>
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
													{#if item.notes}
														<p
															class="text-xs whitespace-pre-line text-gray-500 italic dark:text-gray-400"
														>
															{#each splitTextWithLinks(item.notes) as segment, i (i)}
																{#if segment.type === 'link'}<NoteLink
																		url={segment.value}
																	/>{:else}{segment.value}{/if}
															{/each}
														</p>
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
	</div>
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
		min-height: 3rem;
		padding-block: 0.25rem;
		transition: background-color 600ms ease-out;
	}

	/* Same push-and-hold suppression as .list-card on the lists page: the
	   store icon is a link, so a long-press on it would otherwise show iOS's
	   touch-callout (Open/Copy/Share) or Android Chrome's context menu before
	   the long-press gesture is detected. -webkit-touch-callout covers iOS;
	   the oncontextmenu handler on the element covers Android. */
	.store-trigger {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
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
