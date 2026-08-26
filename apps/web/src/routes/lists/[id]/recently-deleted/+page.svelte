<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ItemDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchRecentItems, purgeItem, restoreItem } from '$lib/api/items';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let recentItems = $state<ItemDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let confirmingPurgeId = $state<number | null>(null);
	let purging = $state(false);

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

	// A plain string built here (vs. an inline `{`...`}` template literal in the markup below)
	// avoids the Svelte compiler's defensive `?? ''` fallback around multi-part interpolated
	// text — item.name is never nullish, so that branch would sit permanently uncovered.
	function purgeConfirmMessage(item: ItemDto): string {
		return `Permanently delete "${item.name}"? This can't be undone.`;
	}

	async function confirmPurge(item: ItemDto) {
		purging = true;
		try {
			await purgeItem(listId, item.id);
			recentItems = recentItems.filter((current) => current.id !== item.id);
			confirmingPurgeId = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete item.';
		} finally {
			purging = false;
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? `${list.name} — Recently Deleted` : undefined}
		htmlTitle={list ? `${list.name} recently deleted` : 'Recently Deleted'}
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
				<li class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
					<div class="flex items-center gap-2">
						<span>{item.name}</span>
						<button
							type="button"
							aria-label="Restore"
							class="ml-auto text-gray-400 hover:text-primary-700 dark:hover:text-primary-400"
							onclick={() => restoreRecentItem(item)}
						>
							<Icon name="restore" class="h-5 w-5" />
						</button>
						<button
							type="button"
							aria-label="Delete permanently"
							class="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => (confirmingPurgeId = item.id)}
						>
							<Icon name="deleteForever" class="h-5 w-5" />
						</button>
					</div>
					{#if confirmingPurgeId === item.id}
						<div
							class="flex items-center gap-2 rounded-lg border border-red-200 p-2 dark:border-red-900"
						>
							<p class="text-sm text-red-600 dark:text-red-400">
								{purgeConfirmMessage(item)}
							</p>
							<button
								type="button"
								class="ml-auto shrink-0 text-sm font-medium text-red-600 dark:text-red-400"
								disabled={purging}
								onclick={() => confirmPurge(item)}
							>
								{purging ? 'Deleting…' : 'Confirm'}
							</button>
							<button
								type="button"
								class="shrink-0 text-sm text-gray-600 dark:text-gray-400"
								disabled={purging}
								onclick={() => (confirmingPurgeId = null)}
							>
								Cancel
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
