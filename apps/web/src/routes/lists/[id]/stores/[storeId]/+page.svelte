<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { CategoryDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { fetchStoreCategoryOrder, fetchStores, reorderStoreCategories } from '$lib/api/stores';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));
	const storeId = $derived(Number(page.params.storeId));

	let list = $state<ListDto | null>(null);
	let storeName = $state<string | null>(null);
	let orderedCategories = $state<CategoryDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let reordering = $state(false);

	async function loadAll() {
		loading = true;
		try {
			const [loadedList, stores, categories, storeOrder] = await Promise.all([
				fetchList(listId),
				fetchStores(listId),
				fetchCategories(listId),
				fetchStoreCategoryOrder(storeId)
			]);
			list = loadedList;
			storeName = stores.find((store) => store.id === storeId)?.name ?? null;

			const overrides = new Map(storeOrder.map((entry) => [entry.categoryId, entry.sortOrder]));
			orderedCategories = [...categories].sort((a, b) => {
				const aOrder = overrides.get(a.id) ?? a.sortOrder;
				const bOrder = overrides.get(b.id) ?? b.sortOrder;
				return aOrder - bOrder;
			});
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load store category order.';
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

	async function move(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= orderedCategories.length) return;

		const reordered = [...orderedCategories];
		[reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
		orderedCategories = reordered;

		reordering = true;
		try {
			await reorderStoreCategories(
				storeId,
				reordered.map((category, sortOrder) => ({ categoryId: category.id, sortOrder }))
			);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save the new order.';
			void loadAll();
		} finally {
			reordering = false;
		}
	}
</script>

<svelte:head>
	<title>{storeName ? `${storeName} aisle order — EveryList` : 'Store — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${storeName ?? 'Store'} — Aisle order` : undefined}
		backHref={resolve('/lists/[id]/stores', { id: String(listId) })}
		backLabel="Stores"
	/>

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if list}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Reorder categories to match this store's real aisle layout. Everyone who shops at "{storeName}"
			sees this order.
		</p>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<ul class="flex flex-col gap-2">
			{#each orderedCategories as category, index (category.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<div class="flex flex-col">
						<button
							type="button"
							class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
							disabled={index === 0 || reordering}
							onclick={() => move(index, -1)}
							aria-label="Move up"
						>
							▲
						</button>
						<button
							type="button"
							class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
							disabled={index === orderedCategories.length - 1 || reordering}
							onclick={() => move(index, 1)}
							aria-label="Move down"
						>
							▼
						</button>
					</div>
					<span>{category.name}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<!-- Reachable only once loadAll's finally has run: loading is false, and
		     its catch always sets `error` when it leaves `list` unset. -->
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
