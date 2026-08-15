<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchLists } from '$lib/api/lists';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let lists = $state<ListDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadLists() {
		loading = true;
		try {
			lists = await fetchLists();
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load lists.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		void loadLists();
	});
</script>

<svelte:head>
	<title>My Lists — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader title="My Lists">
		{#snippet actions()}
			<a
				href={resolve('/lists/new')}
				aria-label="New list"
				class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
			>
				<Icon name="plus" class="h-6 w-6" />
			</a>
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if lists.length === 0}
		<p class="text-gray-500 dark:text-gray-400">No lists yet — tap + to create one.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each lists as list (list.id)}
				<li>
					<a
						href={resolve('/lists/[id]', { id: String(list.id) })}
						class="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:border-primary-500 dark:border-gray-700"
					>
						<span
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
							style:background-color={list.color}
							aria-hidden="true"
						>
							<Icon name={list.icon ?? 'formatListChecks'} class="h-5 w-5" />
						</span>
						<span class="flex flex-1 flex-col">
							<span class="font-medium">{list.name}</span>
							<span class="text-xs text-gray-500 dark:text-gray-400">
								<span>{list.itemCount}</span>
								{list.itemCount === 1 ? 'item' : 'items'}
							</span>
						</span>
						{#if list.archived}
							<span class="text-xs text-gray-400">Archived</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
