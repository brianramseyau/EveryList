<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { CategoryDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import {
		fetchStoreCategoryOrder,
		fetchStores,
		reorderStoreCategories,
		resetStoreCategoryOrder
	} from '$lib/api/stores';
	import { ApiError } from '$lib/api/client';
	import { sortableReorder } from '$lib/actions/sortable-reorder';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));
	const storeId = $derived(Number(page.params.storeId));

	let list = $state<ListDto | null>(null);
	let storeName = $state<string | null>(null);
	let orderedCategories = $state<CategoryDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let reordering = $state(false);
	let resetting = $state(false);
	let hasCustomOrder = $state(false);

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
			hasCustomOrder = storeOrder.length > 0;
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

	// Fires once, on release, with the dragged category's new immediate
	// neighbors (see sortable-reorder.ts) — placed among them, then the
	// whole resulting order is sent to reorderStoreCategories, which
	// renumbers every row server-side.
	async function handleDrop(params: {
		itemId: number;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const dragged = orderedCategories.find((current) => current.id === params.itemId);
		/* v8 ignore next */
		if (!dragged) return;

		const withoutDragged = orderedCategories.filter((current) => current.id !== dragged.id);
		const beforeCategory = withoutDragged.find((current) => current.id === params.beforeItemId);
		const afterCategory = withoutDragged.find((current) => current.id === params.afterItemId);
		const insertAt = beforeCategory
			? withoutDragged.indexOf(beforeCategory) + 1
			: afterCategory
				? withoutDragged.indexOf(afterCategory)
				: withoutDragged.length;
		withoutDragged.splice(insertAt, 0, dragged);
		orderedCategories = withoutDragged;
		hasCustomOrder = true;

		reordering = true;
		try {
			await reorderStoreCategories(
				storeId,
				orderedCategories.map((category, sortOrder) => ({ categoryId: category.id, sortOrder }))
			);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save the new order.';
			void loadAll();
		} finally {
			reordering = false;
		}
	}

	// Clears every StoreCategoryOrder row for this store, so categories fall back to their
	// default (list) order — the "start over" counterpart to handleDrop's per-drag reorders.
	async function handleReset() {
		resetting = true;
		try {
			await resetStoreCategoryOrder(storeId);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to reset the category order.';
		} finally {
			resetting = false;
			void loadAll();
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? 'Aisle order' : undefined}
		subtitle={storeName ?? 'Store'}
		htmlTitle={storeName ? `${storeName} aisle order` : 'Store'}
		backHref={resolve('/lists/[id]/stores', { id: String(listId) })}
		backLabel="Stores"
	>
		{#snippet actions()}
			<button
				type="button"
				aria-label="Reset to default order"
				class="flex h-9 w-9 shrink-0 items-center justify-center text-gray-500 disabled:opacity-30 dark:text-gray-400"
				disabled={resetting || !hasCustomOrder}
				onclick={handleReset}
			>
				<Icon name="restore" class="h-5 w-5" />
			</button>
		{/snippet}
	</PageHeader>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Reorder categories to match this store's real aisle layout. Everyone who shops at "{storeName}"
			sees this order.
		</p>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<p class="text-xs text-gray-400">Press and hold a category to drag it into place.</p>

		<ul
			class="flex flex-col gap-2"
			use:sortableReorder={{
				group: 'store-categories',
				disabled: reordering,
				fallbackAxis: 'y',
				onDrop: handleDrop
			}}
		>
			{#each orderedCategories as category (category.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 bg-paper p-3 dark:border-gray-700"
					data-item-id={category.id}
				>
					<span
						aria-hidden="true"
						class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 dark:text-gray-600"
					>
						<Icon name="dragVertical" class="h-5 w-5" />
					</span>
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
