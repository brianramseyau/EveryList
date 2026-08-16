<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Label, Select, Textarea } from 'flowbite-svelte';
	import type { FavoriteItemDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import {
		addFavoriteToList,
		createFavorite,
		deleteFavorite,
		fetchFavorites
	} from '$lib/api/favorites';
	import { fetchList } from '$lib/api/lists';
	import { fetchItems } from '$lib/api/items';
	import { fetchStores } from '$lib/api/stores';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let favorites = $state<FavoriteItemDto[]>([]);
	let items = $state<ItemDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newFavoriteName = $state('');
	let newFavoriteStoreId = $state<number | null>(null);
	let newFavoriteNotes = $state('');
	let newFavoritePrice = $state('');
	let creating = $state(false);

	let addingToList = $state<number | null>(null);
	let addedMessage = $state<string | null>(null);

	const itemNames = $derived(new Set(items.map((item) => item.name.trim().toLowerCase())));

	async function loadAll() {
		loading = true;
		try {
			[list, favorites, items, stores] = await Promise.all([
				fetchList(listId),
				fetchFavorites(listId),
				fetchItems(listId),
				fetchStores(listId)
			]);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load favorites.';
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

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		if (!newFavoriteName.trim()) return;
		const trimmedPrice = newFavoritePrice.trim();
		const price = trimmedPrice === '' ? null : Math.round(Number(trimmedPrice) * 100);
		if (price !== null && !Number.isFinite(price)) return;

		creating = true;
		try {
			const favorite = await createFavorite(listId, {
				name: newFavoriteName.trim(),
				storeId: newFavoriteStoreId,
				notes: newFavoriteNotes.trim() || null,
				price
			});
			favorites = [...favorites, favorite];
			newFavoriteName = '';
			newFavoriteStoreId = null;
			newFavoriteNotes = '';
			newFavoritePrice = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create favorite.';
		} finally {
			creating = false;
		}
	}

	async function removeFavorite(favorite: FavoriteItemDto) {
		favorites = favorites.filter((current) => current.id !== favorite.id);
		try {
			await deleteFavorite(listId, favorite.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete favorite.';
			void loadAll();
		}
	}

	async function handleAddToList(favorite: FavoriteItemDto) {
		addingToList = favorite.id;
		addedMessage = null;
		try {
			const item = await addFavoriteToList(listId, favorite.id);
			items = [...items.filter((current) => current.id !== item.id), item];
			// `list` is always loaded by the time this button is interactable
			// (loading gates the whole form); the `?? 'the list'` only satisfies
			// the `ListDto | null` return type.
			/* v8 ignore next */
			addedMessage = `Added "${favorite.name}" to ${list?.name ?? 'the list'}.`;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to add item to list.';
		} finally {
			addingToList = null;
		}
	}
</script>

<svelte:head>
	<title>{list ? `${list.name} favorites — EveryList` : 'Favorites — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${list.name} — Favorites` : undefined}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	/>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		Items you buy often on this list — add one back in a tap.
	</p>

	<form class="flex flex-col gap-2" onsubmit={handleCreate}>
		<div class="flex gap-2">
			<div class="flex-1">
				<Input placeholder="New favorite name" bind:value={newFavoriteName} />
			</div>
			<Button type="submit" disabled={creating || !newFavoriteName.trim()}>Add</Button>
		</div>
		{#if stores.length > 0}
			<div class="flex flex-col gap-1">
				<Label for="favorite-store">Store</Label>
				<Select
					id="favorite-store"
					items={stores.map((store) => ({ value: store.id, name: store.name }))}
					placeholder="No store"
					clearable
					value={newFavoriteStoreId ?? ''}
					onchange={(event) => {
						const raw = (event.target as HTMLSelectElement).value;
						newFavoriteStoreId = raw === '' ? null : Number(raw);
					}}
				/>
			</div>
		{/if}
		<Input inputmode="decimal" placeholder="Price (optional)" bind:value={newFavoritePrice} />
		<Textarea placeholder="Notes (optional)" rows={2} bind:value={newFavoriteNotes} />
	</form>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
	{#if addedMessage}
		<p class="text-sm text-green-600 dark:text-green-400">{addedMessage}</p>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if favorites.length === 0}
		<p class="text-gray-600 dark:text-gray-400">No favorites yet — add one above.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each favorites as favorite (favorite.id)}
				{@const onList = itemNames.has(favorite.name.trim().toLowerCase())}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					{#if onList}
						<span title="Already on this list">
							<Icon name="checkCircle" class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
						</span>
					{/if}
					<div class="flex flex-col">
						<div class="flex items-center gap-1">
							<span>{favorite.name}</span>
							{#if favorite.defaultQuantity}
								<span class="text-gray-600 dark:text-gray-400"
									>(<span class="font-mono tabular-nums">{favorite.defaultQuantity}</span>)</span
								>
							{/if}
						</div>
						{#if favorite.storeId}
							{@const favoriteStore = stores.find((store) => store.id === favorite.storeId)}
							{#if favoriteStore}
								<span class="text-xs" style:color={favoriteStore.color}>{favoriteStore.name}</span>
							{/if}
						{/if}
					</div>
					<div class="ml-auto flex items-center gap-1">
						<button
							type="button"
							aria-label={`Add ${favorite.name} to list`}
							class="flex h-11 w-11 shrink-0 items-center justify-center text-primary-600 disabled:opacity-30 dark:text-primary-400"
							disabled={addingToList === favorite.id}
							onclick={() => handleAddToList(favorite)}
						>
							<Icon name="plusCircle" class="h-6 w-6" />
						</button>
						<button
							type="button"
							aria-label={`Remove ${favorite.name} from favorites`}
							class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => removeFavorite(favorite)}
						>
							<Icon name="close" class="h-5 w-5" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>
