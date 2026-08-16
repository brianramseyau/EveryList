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
	import { pressHoldReorder } from '$lib/actions/press-hold-reorder';
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

	let listEl: HTMLUListElement | undefined = $state();

	function getRowEls(): HTMLElement[] {
		// Only reachable before the list has ever rendered — the drag this
		// feeds doesn't exist yet either, so it can't be exercised.
		/* v8 ignore next */
		if (!listEl) return [];
		return [...listEl.children] as HTMLElement[];
	}

	// Fires once, on release — dragging itself never touches `orderedCategories`.
	async function handleDrop(fromIndex: number, toIndex: number) {
		const reordered = [...orderedCategories];
		const [moved] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, moved!);
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

		<ul class="flex flex-col gap-2" bind:this={listEl}>
			{#each orderedCategories as category, index (category.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 bg-paper p-3 dark:border-gray-700"
					use:pressHoldReorder={{ index, disabled: reordering, getRowEls, ondrop: handleDrop }}
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
