<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { FavoriteItemDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import {
		addFavoriteToList,
		createFavorite,
		deleteFavorite,
		fetchFavorites
	} from '$lib/api/favorites';
	import { fetchList } from '$lib/api/lists';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let favorites = $state<FavoriteItemDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newFavoriteName = $state('');
	let creating = $state(false);

	let addingToList = $state<number | null>(null);
	let addedMessage = $state<string | null>(null);

	async function loadAll() {
		loading = true;
		try {
			[list, favorites] = await Promise.all([fetchList(listId), fetchFavorites(listId)]);
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
		creating = true;
		try {
			const favorite = await createFavorite(listId, { name: newFavoriteName.trim() });
			favorites = [...favorites, favorite];
			newFavoriteName = '';
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
			await addFavoriteToList(listId, favorite.id);
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

	<form class="flex gap-2" onsubmit={handleCreate}>
		<div class="flex-1">
			<Input placeholder="New favorite name" bind:value={newFavoriteName} />
		</div>
		<Button type="submit" disabled={creating || !newFavoriteName.trim()}>Add</Button>
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
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<span>{favorite.name}</span>
					{#if favorite.defaultQuantity}
						<span class="text-gray-600 dark:text-gray-400"
							>(<span>{favorite.defaultQuantity}</span>)</span
						>
					{/if}
					<div class="ml-auto flex items-center gap-3">
						<button
							type="button"
							class="text-sm text-primary-700 underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-primary-400"
							disabled={addingToList === favorite.id}
							onclick={() => handleAddToList(favorite)}
						>
							{addingToList === favorite.id ? 'Adding…' : 'Add to list'}
						</button>
						<button
							type="button"
							class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => removeFavorite(favorite)}
						>
							Remove
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>
