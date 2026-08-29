<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { FavoriteItemDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { addFavoriteToList, deleteFavorite, fetchFavorites } from '$lib/api/favorites';
	import { fetchList } from '$lib/api/lists';
	import { fetchItems, updateItem } from '$lib/api/items';
	import { fetchStores } from '$lib/api/stores';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let favorites = $state<FavoriteItemDto[]>([]);
	let items = $state<ItemDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let addingToList = $state<number | null>(null);
	let addedMessage = $state<string | null>(null);

	// An item blocks re-adding only while it's unchecked — a checked-off item
	// has already been "used up", so tapping the favorite again to add a
	// fresh one is allowed.
	const blockingItemNames = $derived(
		new Set(items.filter((item) => !item.checked).map((item) => item.name.trim().toLowerCase()))
	);

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
		// A checked-off item with the same name is already "on the list" — just
		// uncheck it instead of creating a duplicate.
		const checkedMatch = items.find(
			(current) =>
				current.checked && current.name.trim().toLowerCase() === favorite.name.trim().toLowerCase()
		);
		try {
			if (checkedMatch) {
				items = items.map((current) =>
					current.id === checkedMatch.id ? { ...current, checked: false } : current
				);
				await updateItem(listId, checkedMatch.id, { checked: false });
			} else {
				const item = await addFavoriteToList(listId, favorite.id);
				items = [...items.filter((current) => current.id !== item.id), item];
			}
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

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? 'Favorites' : undefined}
		subtitle={list?.name}
		htmlTitle={list ? `${list.name} favorites` : 'Favorites'}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	>
		{#snippet actions()}
			<a
				href={resolve('/lists/[id]/favorites/new', { id: String(listId) })}
				aria-label="New favorite"
				class="flex h-9 w-9 shrink-0 items-center justify-center text-primary-700 dark:text-primary-400"
			>
				<Icon name="plus" class="h-6 w-6" />
			</a>
		{/snippet}
	</PageHeader>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		Items you buy often on this list — add one back in a tap.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
	{#if addedMessage}
		<p class="text-sm text-green-600 dark:text-green-400">{addedMessage}</p>
	{/if}

	{#if loading}
		<Loader />
	{:else if favorites.length === 0}
		<p class="text-gray-600 dark:text-gray-400">No favorites yet — tap + to add one.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each favorites as favorite (favorite.id)}
				{@const onList = blockingItemNames.has(favorite.name.trim().toLowerCase())}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<button
						type="button"
						aria-label={`Add ${favorite.name} to list`}
						class="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
						disabled={onList || addingToList === favorite.id}
						onclick={() => handleAddToList(favorite)}
					>
						{#if onList}
							<span title="Already on this list">
								<Icon
									name="checkCircle"
									class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
								/>
							</span>
						{/if}
						<div class="flex min-w-0 flex-col">
							<div class="flex min-w-0 items-center gap-1">
								<span class="wrap-anywhere">{favorite.name}</span>
								{#if favorite.defaultQuantity}
									<span class="text-gray-600 dark:text-gray-400"
										>(<span class="font-mono tabular-nums">{favorite.defaultQuantity}</span>)</span
									>
								{/if}
							</div>
							{#if favorite.storeId}
								{@const favoriteStore = stores.find((store) => store.id === favorite.storeId)}
								{#if favoriteStore}
									<span class="text-xs" style:color={favoriteStore.color}>{favoriteStore.name}</span
									>
								{/if}
							{/if}
						</div>
					</button>
					<div class="ml-auto flex items-center gap-1">
						<a
							href={resolve('/lists/[id]/favorites/[favoriteId]', {
								id: String(listId),
								favoriteId: String(favorite.id)
							})}
							aria-label={`Edit ${favorite.name}`}
							class="flex h-11 w-11 shrink-0 items-center justify-center text-primary-600 dark:text-primary-400"
						>
							<Icon name="pencilCircle" class="h-6 w-6" />
						</a>
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
