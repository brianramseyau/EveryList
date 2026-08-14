<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { createList, fetchLists } from '$lib/api/lists';
	import { logout } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const DEFAULT_COLOR = '#3b82f6';

	let lists = $state<ListDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let newListName = $state('');
	let newListColor = $state(DEFAULT_COLOR);
	let newListIcon = $state('formatListChecks');
	let creating = $state(false);

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

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		if (!newListName.trim()) return;
		creating = true;
		try {
			const list = await createList({
				name: newListName.trim(),
				color: newListColor,
				icon: newListIcon
			});
			lists = [...lists, list];
			newListName = '';
			newListColor = DEFAULT_COLOR;
			newListIcon = 'formatListChecks';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create list.';
		} finally {
			creating = false;
		}
	}

	async function handleLogout() {
		await logout();
		await goto(resolve('/login'));
	}
</script>

<svelte:head>
	<title>My Lists — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader title="My Lists">
		{#snippet actions()}
			<button
				type="button"
				onclick={handleLogout}
				class="text-gray-500 hover:underline dark:text-gray-400">Log out</button
			>
		{/snippet}
	</PageHeader>

	<form class="flex flex-wrap gap-2" onsubmit={handleCreate}>
		<Input placeholder="New list name" bind:value={newListName} class="min-w-40 flex-1" />
		<IconPicker value={newListIcon} onselect={(name) => (newListIcon = name)} />
		<ColorPicker value={newListColor} onselect={(color) => (newListColor = color)} />
		<Button type="submit" disabled={creating || !newListName.trim()}>Add</Button>
	</form>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if lists.length === 0}
		<p class="text-gray-500 dark:text-gray-400">No lists yet — create one above.</p>
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
