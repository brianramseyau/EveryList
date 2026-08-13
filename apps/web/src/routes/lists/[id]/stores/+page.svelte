<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Radio } from 'flowbite-svelte';
	import type { ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { attachStore, detachStore, fetchStores } from '$lib/api/stores';
	import { getSelectedStore, setSelectedStore } from '$lib/api/selected-store';
	import { ApiError } from '$lib/api/client';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newStoreName = $state('');
	let creating = $state(false);

	let selectedStoreId = $state<number | null>(null);

	async function loadAll() {
		loading = true;
		try {
			[list, stores] = await Promise.all([fetchList(listId), fetchStores(listId)]);
			selectedStoreId = getSelectedStore(listId);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load stores.';
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
		if (!newStoreName.trim()) return;
		creating = true;
		try {
			const store = await attachStore(listId, { name: newStoreName.trim() });
			stores = [...stores, store];
			newStoreName = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create store.';
		} finally {
			creating = false;
		}
	}

	async function removeStore(store: StoreDto) {
		stores = stores.filter((current) => current.id !== store.id);
		if (selectedStoreId === store.id) selectedStoreId = null;
		try {
			await detachStore(listId, store.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to remove store.';
			void loadAll();
		}
	}

	// "Currently shopping at" is local-only (see $lib/api/selected-store.ts) — persist
	// whenever the radio selection changes, including the initial load's restore.
	$effect(() => {
		if (!loading) setSelectedStore(listId, selectedStoreId);
	});
</script>

<svelte:head>
	<title>{list ? `${list.name} stores — EveryList` : 'Stores — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<a
		href={resolve('/lists/[id]', { id: String(listId) })}
		class="text-sm text-primary-600 hover:underline dark:text-primary-400">← Back to list</a
	>

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if list}
		<h1 class="text-2xl font-bold">{list.name} — Stores</h1>
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Pick the store you're shopping at so categories match its aisle layout. This choice is only
			remembered on this device.
		</p>

		<form class="flex gap-2" onsubmit={handleCreate}>
			<Input placeholder="New store name" bind:value={newStoreName} class="flex-1" />
			<Button type="submit" disabled={creating || !newStoreName.trim()}>Add store</Button>
		</form>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		{#if stores.length === 0}
			<p class="text-gray-500 dark:text-gray-400">No stores yet — add one above.</p>
		{:else}
			<ul class="flex flex-col gap-2">
				<li>
					<Radio bind:group={selectedStoreId} value={null}>No store selected (default order)</Radio>
				</li>
				{#each stores as store (store.id)}
					<li
						class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
					>
						<Radio bind:group={selectedStoreId} value={store.id}>
							{store.name}
						</Radio>
						<a
							href={resolve('/lists/[id]/stores/[storeId]', {
								id: String(listId),
								storeId: String(store.id)
							})}
							class="ml-auto text-xs text-primary-600 hover:underline dark:text-primary-400"
						>
							Reorder categories
						</a>
						<button
							type="button"
							class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => removeStore(store)}
						>
							Remove
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
