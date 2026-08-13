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

	let lists = $state<ListDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let newListName = $state('');
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
			const list = await createList({ name: newListName.trim() });
			lists = [...lists, list];
			newListName = '';
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
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">My Lists</h1>
		<div class="flex items-center gap-4 text-sm">
			<a href={resolve('/favorites')} class="text-primary-600 dark:text-primary-400 hover:underline"
				>Favorites</a
			>
			<button
				type="button"
				onclick={handleLogout}
				class="text-gray-500 hover:underline dark:text-gray-400">Log out</button
			>
		</div>
	</div>

	<form class="flex gap-2" onsubmit={handleCreate}>
		<Input placeholder="New list name" bind:value={newListName} />
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
						class="hover:border-primary-500 flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
					>
						<span>{list.name}</span>
						{#if list.archived}
							<span class="text-xs text-gray-400">Archived</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
