<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ItemDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchRecentItems, restoreItem } from '$lib/api/items';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let recentItems = $state<ItemDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadAll() {
		loading = true;
		try {
			[list, recentItems] = await Promise.all([fetchList(listId), fetchRecentItems(listId)]);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load recently deleted items.';
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

	async function restoreRecentItem(item: ItemDto) {
		recentItems = recentItems.filter((current) => current.id !== item.id);
		try {
			await restoreItem(listId, item.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to restore item.';
			void loadAll();
		}
	}
</script>

<svelte:head>
	<title
		>{list ? `${list.name} recently deleted — EveryList` : 'Recently Deleted — EveryList'}</title
	>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${list.name} — Recently Deleted` : undefined}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	/>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if recentItems.length === 0}
		<p class="text-gray-600 dark:text-gray-400">Nothing recently deleted.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each recentItems as item (item.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<span>{item.name}</span>
					<button
						type="button"
						class="ml-auto text-sm text-primary-700 underline dark:text-primary-400"
						onclick={() => restoreRecentItem(item)}
					>
						Restore
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</main>
