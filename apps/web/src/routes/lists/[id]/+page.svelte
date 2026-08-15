<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Checkbox, Input, Select, Textarea } from 'flowbite-svelte';
	import type { CategoryDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { deleteList, fetchList, updateList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import {
		createItem,
		deleteItem,
		fetchItems,
		fetchRecentItems,
		importItems,
		restoreItem,
		updateItem
	} from '$lib/api/items';
	import { fetchStoreCategoryOrder, fetchStores } from '$lib/api/stores';
	import { getSelectedStore } from '$lib/api/selected-store';
	import { isRowDirty } from '$lib/offline/db';
	import { ApiError } from '$lib/api/client';
	import { subscribeToList } from '$lib/realtime';
	import { refreshBadgeCount } from '$lib/pwa/badge';
	import Icon from '$lib/components/Icon.svelte';
	import ListMenu from '$lib/components/ListMenu.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SyncToast from '$lib/components/SyncToast.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let categories = $state<CategoryDto[]>([]);
	let items = $state<ItemDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	let filterStoreId = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newItemName = $state('');
	let newItemQuantity = $state('');
	let adding = $state(false);

	let importText = $state('');
	let importOpen = $state(false);
	let importing = $state(false);

	let recentItems = $state<ItemDto[]>([]);
	let recentOpen = $state(false);
	let loadingRecent = $state(false);

	let syncToastVisible = $state(false);
	let unsubscribeRealtime: (() => void) | null = null;

	// Store-specific aisle order, if the shopper has picked a store for this
	// list on this device — purely local, see $lib/api/selected-store.ts.
	let storeCategoryOverrides: Map<number, number> = new SvelteMap();

	const visibleItems = $derived(
		filterStoreId === null ? items : items.filter((item) => item.storeId === filterStoreId)
	);

	const groups = $derived.by(() => {
		const byCategory = new SvelteMap<number | null, ItemDto[]>();
		for (const item of visibleItems) {
			if (item.checked) continue;
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

	const totalCents = $derived(
		visibleItems.reduce((sum, item) => sum + (item.price ?? 0), 0)
	);

	function formatPrice(cents: number): string {
		return (cents / 100).toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD'
		});
	}

	const totalText = $derived(`Total: ${formatPrice(totalCents)}`);

	async function loadAll() {
		loading = true;
		try {
			[list, categories, items, stores] = await Promise.all([
				fetchList(listId),
				fetchCategories(listId),
				fetchItems(listId),
				fetchStores(listId)
			]);

			const selectedStoreId = await getSelectedStore(listId);
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
	});

	function refreshFromSync() {
		syncToastVisible = false;
		void loadAll();
	}

	async function handleListUpdate(
		input: Partial<{
			name: string;
			color: string;
			icon: string | null;
			archived: boolean;
			badgeExcluded: boolean;
		}>
	) {
		try {
			list = await updateList(listId, input);
			void refreshBadgeCount();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update list.';
		}
	}

	async function handleListDelete() {
		try {
			await deleteList(listId);
			await goto(resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete list.';
		}
	}

	async function handleAddItem(event: SubmitEvent) {
		event.preventDefault();
		if (!newItemName.trim()) return;
		adding = true;
		try {
			const item = await createItem(listId, {
				name: newItemName.trim(),
				quantity: newItemQuantity.trim() || null
			});
			items = [...items, item];
			newItemName = '';
			newItemQuantity = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to add item.';
		} finally {
			adding = false;
		}
	}

	async function handleImport(event: SubmitEvent) {
		event.preventDefault();
		if (!importText.trim()) return;
		importing = true;
		try {
			const imported = await importItems(listId, importText);
			items = [...items, ...imported];
			importText = '';
			importOpen = false;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to import items.';
		} finally {
			importing = false;
		}
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

	async function tagItemStore(item: ItemDto, storeId: number | null) {
		items = items.map((current) => (current.id === item.id ? { ...current, storeId } : current));
		try {
			await updateItem(listId, item.id, { storeId });
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update item.';
			void loadAll();
		}
	}

	async function tagItemPrice(item: ItemDto, raw: string) {
		const trimmed = raw.trim();
		const price = trimmed === '' ? null : Math.round(Number(trimmed) * 100);
		if (price !== null && !Number.isFinite(price)) return;

		items = items.map((current) => (current.id === item.id ? { ...current, price } : current));
		try {
			await updateItem(listId, item.id, { price });
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update item.';
			void loadAll();
		}
	}

	async function removeItem(item: ItemDto) {
		items = items.filter((current) => current.id !== item.id);
		try {
			await deleteItem(listId, item.id);
			if (recentOpen) recentItems = [item, ...recentItems];
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete item.';
			void loadAll();
		}
	}

	async function loadRecent() {
		loadingRecent = true;
		try {
			recentItems = await fetchRecentItems(listId);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load recently deleted items.';
		} finally {
			loadingRecent = false;
		}
	}

	function toggleRecent() {
		recentOpen = !recentOpen;
		if (recentOpen) void loadRecent();
	}

	async function restoreRecentItem(item: ItemDto) {
		recentItems = recentItems.filter((current) => current.id !== item.id);
		try {
			const restored = await restoreItem(listId, item.id);
			items = [...items, restored];
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to restore item.';
			void loadRecent();
		}
	}
</script>

<svelte:head>
	<title>{list ? `${list.name} — EveryList` : 'List — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
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
				href={resolve('/lists/[id]/stores', { id: String(listId) })}
				aria-label="Stores"
				class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
			>
				<Icon name="store" class="h-5 w-5" />
			</a>
			<ListMenu {listId} {list} onupdate={handleListUpdate} ondelete={handleListDelete} />
		{/snippet}
	</PageHeader>

	<SyncToast
		visible={syncToastVisible}
		onrefresh={refreshFromSync}
		ondismiss={() => (syncToastVisible = false)}
	/>

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if list}
		<form class="flex gap-2" onsubmit={handleAddItem}>
			<div class="flex-1">
				<Input placeholder="Item name" bind:value={newItemName} />
			</div>
			<div class="w-24">
				<Input placeholder="Qty" bind:value={newItemQuantity} />
			</div>
			<Button type="submit" disabled={adding || !newItemName.trim()}>Add</Button>
		</form>

		<button
			type="button"
			class="self-start text-sm text-primary-600 hover:underline dark:text-primary-400"
			onclick={() => (importOpen = !importOpen)}
		>
			{importOpen ? 'Cancel paste import' : 'Paste in a list…'}
		</button>

		{#if importOpen}
			<form class="flex flex-col gap-2" onsubmit={handleImport}>
				<Textarea
					bind:value={importText}
					rows={4}
					placeholder="One item per line, e.g. Milk, Bread, Eggs"
				/>
				<Button type="submit" disabled={importing || !importText.trim()} class="self-start"
					>{importing ? 'Importing…' : 'Import items'}</Button
				>
			</form>
		{/if}

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		{#if stores.length > 0}
			<div class="w-48">
				<Select
					items={stores.map((store) => ({ value: store.id, name: store.name }))}
					placeholder="All stores"
					clearable
					value={filterStoreId ?? ''}
					onchange={(event) => {
						const raw = (event.target as HTMLSelectElement).value;
						filterStoreId = raw === '' ? null : Number(raw);
					}}
				/>
			</div>
		{/if}

		{#if totalCents > 0}
			<p class="text-sm font-semibold text-gray-700 dark:text-gray-300">{totalText}</p>
		{/if}

		{#if items.length === 0}
			<p class="text-gray-500 dark:text-gray-400">No items yet — add one above.</p>
		{:else}
			<div class="flex flex-col gap-6">
				{#each groups as group (group.category?.id ?? 'uncategorized')}
					<section>
						<h2
							class="mb-2 flex items-center gap-2 text-sm font-semibold"
							style:color={group.category ? list.color : undefined}
						>
							{#if group.category}
								<Icon name={group.category.icon} class="h-4 w-4" />
							{/if}
							<span class={group.category ? '' : 'text-gray-500 dark:text-gray-400'}>
								{group.category?.name ?? 'Uncategorized'}
							</span>
						</h2>
						<ul class="flex flex-col gap-1">
							{#each group.items as item (item.id)}
								<li class="flex items-center gap-2">
									<Checkbox checked={item.checked} onchange={() => toggleChecked(item)}>
										<span>{item.name}</span>
										{#if item.quantity}
											<span class="text-gray-500 dark:text-gray-400"
												>(<span>{item.quantity}</span>)</span
											>
										{/if}
									</Checkbox>
									<div class="ml-auto w-16">
										<Input
											size="sm"
											inputmode="decimal"
											placeholder="Price"
											value={item.price !== null ? (item.price / 100).toFixed(2) : ''}
											onchange={(event) => {
												void tagItemPrice(item, (event.target as HTMLInputElement).value);
											}}
										/>
									</div>
									{#if stores.length > 0}
										<div class="w-32">
											<Select
												size="sm"
												items={stores.map((store) => ({ value: store.id, name: store.name }))}
												placeholder="No store"
												clearable
												value={item.storeId ?? ''}
												onchange={(event) => {
													const raw = (event.target as HTMLSelectElement).value;
													void tagItemStore(item, raw === '' ? null : Number(raw));
												}}
											/>
										</div>
									{/if}
									<button
										type="button"
										class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
										onclick={() => removeItem(item)}
									>
										Remove
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/each}

				{#if checkedItems.length > 0}
					<section>
						<h2 class="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Checked</h2>
						<ul class="flex flex-col gap-1">
							{#each checkedItems as item (item.id)}
								<li class="flex items-center gap-2">
									<Checkbox checked={item.checked} onchange={() => toggleChecked(item)}>
										<span class="text-gray-400 line-through">{item.name}</span>
									</Checkbox>
									<button
										type="button"
										class="ml-auto text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
										onclick={() => removeItem(item)}
									>
										Remove
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>
		{/if}

		<div>
			<button
				type="button"
				class="text-sm text-primary-600 hover:underline dark:text-primary-400"
				onclick={toggleRecent}
			>
				{recentOpen ? 'Hide recently deleted' : 'Show recently deleted'}
			</button>

			{#if recentOpen}
				{#if loadingRecent}
					<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
				{:else if recentItems.length === 0}
					<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Nothing recently deleted.</p>
				{:else}
					<ul class="mt-2 flex flex-col gap-1">
						{#each recentItems as item (item.id)}
							<li class="flex items-center gap-2 text-sm">
								<span class="text-gray-500 dark:text-gray-400">{item.name}</span>
								<button
									type="button"
									class="ml-auto text-primary-600 hover:underline dark:text-primary-400"
									onclick={() => restoreRecentItem(item)}
								>
									Restore
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
	{:else}
		<!-- Reachable only once loadAll's finally has run: loading is false, and
		     its catch always sets `error` when it leaves `list` unset. -->
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
