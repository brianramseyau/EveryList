<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';
	import type { CategoryDto, FavoriteItemDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { fetchItems, updateItem } from '$lib/api/items';
	import { fetchStores } from '$lib/api/stores';
	import { createFavorite, deleteFavorite, fetchFavorites } from '$lib/api/favorites';
	import { getDb } from '$lib/offline/db';
	import { ApiError } from '$lib/api/client';
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
			const [listResult, itemResult, categoriesResult, storesResult, favoritesResult] =
				await Promise.all([
					fetchList(listId),
					loadItem(),
					fetchCategories(listId),
					fetchStores(listId),
					fetchFavorites(listId)
				]);
			list = listResult;
			item = itemResult;
			categories = categoriesResult;
			stores = storesResult;
			favorites = favoritesResult;

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

<svelte:head>
	<title>{item ? `${item.name} — EveryList` : 'Item — EveryList'}</title>
</svelte:head>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? `${list.name} — Item` : 'Item'}
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
	{:else}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
