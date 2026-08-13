<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input, Select } from 'flowbite-svelte';
	import type { FavoriteItemDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import {
		addFavoriteToList,
		createFavorite,
		deleteFavorite,
		fetchFavorites
	} from '$lib/api/favorites';
	import { fetchLists } from '$lib/api/lists';
	import { ApiError } from '$lib/api/client';

	let favorites = $state<FavoriteItemDto[]>([]);
	let lists = $state<ListDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newFavoriteName = $state('');
	let creating = $state(false);

	let selectedListId = $state<number | undefined>(undefined);
	let addingToList = $state<number | null>(null);
	let addedMessage = $state<string | null>(null);

	async function loadAll() {
		loading = true;
		try {
			[favorites, lists] = await Promise.all([fetchFavorites(), fetchLists()]);
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
			const favorite = await createFavorite({ name: newFavoriteName.trim() });
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
			await deleteFavorite(favorite.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete favorite.';
			void loadAll();
		}
	}

	async function handleAddToList(favorite: FavoriteItemDto) {
		if (!selectedListId) return;
		addingToList = favorite.id;
		addedMessage = null;
		try {
			await addFavoriteToList(favorite.id, selectedListId);
			const list = lists.find((current) => current.id === selectedListId);
			addedMessage = `Added "${favorite.name}" to ${list?.name ?? 'the list'}.`;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to add item to list.';
		} finally {
			addingToList = null;
		}
	}
</script>

<svelte:head>
	<title>Favorites — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<a href={resolve('/lists')} class="text-primary-600 dark:text-primary-400 text-sm hover:underline"
		>← My Lists</a
	>

	<h1 class="text-2xl font-bold">Favorites</h1>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		Your master list of items you buy often — add one to any list in a tap.
	</p>

	<form class="flex gap-2" onsubmit={handleCreate}>
		<Input placeholder="New favorite name" bind:value={newFavoriteName} class="flex-1" />
		<Button type="submit" disabled={creating || !newFavoriteName.trim()}>Add</Button>
	</form>

	{#if lists.length > 0}
		<div class="flex items-center gap-2 text-sm">
			<span class="text-gray-500 dark:text-gray-400">Add to:</span>
			<Select
				items={lists.map((list) => ({ name: list.name, value: list.id }))}
				bind:value={selectedListId}
				placeholder="Choose a list…"
				class="flex-1"
			/>
		</div>
	{/if}

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
	{#if addedMessage}
		<p class="text-sm text-green-600 dark:text-green-400">{addedMessage}</p>
	{/if}

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if favorites.length === 0}
		<p class="text-gray-500 dark:text-gray-400">No favorites yet — add one above.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each favorites as favorite (favorite.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<span>{favorite.name}</span>
					{#if favorite.defaultQuantity}
						<span class="text-gray-500 dark:text-gray-400">({favorite.defaultQuantity})</span>
					{/if}
					<div class="ml-auto flex items-center gap-3">
						<button
							type="button"
							class="text-primary-600 dark:text-primary-400 text-sm hover:underline disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!selectedListId || addingToList === favorite.id}
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
