<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';
	import type { CategoryDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { fetchStores } from '$lib/api/stores';
	import { createFavorite } from '$lib/api/favorites';
	import { ApiError } from '$lib/api/client';
	import ItemFields from '$lib/components/ItemFields.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let categories = $state<CategoryDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);

	let draftName = $state('');
	let draftQuantity = $state('');
	let draftPrice = $state('');
	let draftCategoryId = $state<number | null>(null);
	let draftStoreId = $state<number | null>(null);
	let draftNotes = $state('');

	async function loadAll() {
		loading = true;
		try {
			[list, categories, stores] = await Promise.all([
				fetchList(listId),
				fetchCategories(listId),
				fetchStores(listId)
			]);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load favorite.';
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
			await createFavorite(listId, {
				name: draftName.trim(),
				defaultQuantity: draftQuantity.trim() || null,
				notes: draftNotes.trim() || null,
				price,
				defaultCategoryId: draftCategoryId,
				storeId: draftStoreId
			});
			await goto(resolve('/lists/[id]/favorites', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create favorite.';
			saving = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
</script>

<svelte:head>
	<title>New Favorite — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title="New Favorite"
		backHref={resolve('/lists/[id]/favorites', { id: String(listId) })}
		backLabel="Cancel"
	>
		{#snippet actions()}
			<Button type="button" size="sm" disabled={saving || !draftName.trim()} onclick={save}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		{/snippet}
	</PageHeader>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if !loading}
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
	{/if}
</main>
