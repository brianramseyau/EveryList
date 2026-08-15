<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input, Select } from 'flowbite-svelte';
	import type { FolderDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchLists, updateList } from '$lib/api/lists';
	import { createFolder, deleteFolder, fetchFolders } from '$lib/api/folders';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let lists = $state<ListDto[]>([]);
	let folders = $state<FolderDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newFolderName = $state('');
	let creatingFolder = $state(false);

	const groups = $derived.by(() => {
		const byFolder = new SvelteMap<number, ListDto[]>();
		for (const list of lists) {
			if (list.folderId === null) continue;
			if (!byFolder.has(list.folderId)) byFolder.set(list.folderId, []);
			byFolder.get(list.folderId)!.push(list);
		}

		const orderedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
		return orderedFolders.map((folder) => ({ folder, lists: byFolder.get(folder.id) ?? [] }));
	});

	const unfiledLists = $derived(lists.filter((list) => list.folderId === null));

	async function loadAll() {
		loading = true;
		try {
			[lists, folders] = await Promise.all([fetchLists(), fetchFolders()]);
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
		void loadAll();
	});

	async function handleCreateFolder(event: SubmitEvent) {
		event.preventDefault();
		if (!newFolderName.trim()) return;
		creatingFolder = true;
		try {
			const folder = await createFolder({ name: newFolderName.trim() });
			folders = [...folders, folder];
			newFolderName = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create folder.';
		} finally {
			creatingFolder = false;
		}
	}

	async function handleDeleteFolder(folder: FolderDto) {
		folders = folders.filter((current) => current.id !== folder.id);
		lists = lists.map((list) => (list.folderId === folder.id ? { ...list, folderId: null } : list));
		try {
			await deleteFolder(folder.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete folder.';
			void loadAll();
		}
	}

	async function moveListToFolder(list: ListDto, folderId: number | null) {
		lists = lists.map((current) => (current.id === list.id ? { ...current, folderId } : current));
		try {
			await updateList(list.id, { folderId });
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to move list.';
			void loadAll();
		}
	}
</script>

{#snippet listCard(list: ListDto)}
	<li class="flex items-center gap-2">
		<a
			href={resolve('/lists/[id]', { id: String(list.id) })}
			class="flex flex-1 items-center gap-3 rounded-lg border border-l-4 border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:hover:border-gray-600"
			style:border-left-color={list.color}
		>
			<span
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
				style:background-color={list.color}
				aria-hidden="true"
			>
				<Icon name={list.icon ?? 'formatListChecks'} class="h-5 w-5" />
			</span>
			<span class="flex flex-1 flex-col">
				<span class="font-display font-medium">{list.name}</span>
				<span class="font-mono text-xs text-gray-600 tabular-nums dark:text-gray-400">
					<span>{list.itemCount}</span>
					{list.itemCount === 1 ? 'item' : 'items'}
				</span>
			</span>
			{#if list.passcodeHash}
				<span class="shrink-0 text-gray-400" title="Passcode protected">
					<Icon name="lock" class="h-4 w-4" />
					<span class="sr-only">Passcode protected</span>
				</span>
			{/if}
			{#if list.archived}
				<span class="text-xs text-gray-400">Archived</span>
			{/if}
		</a>
		{#if folders.length > 0}
			<div class="w-32">
				<Select
					size="sm"
					items={folders.map((folder) => ({ value: folder.id, name: folder.name }))}
					placeholder="No folder"
					clearable
					value={list.folderId ?? ''}
					onchange={(event) => {
						const raw = (event.target as HTMLSelectElement).value;
						void moveListToFolder(list, raw === '' ? null : Number(raw));
					}}
				/>
			</div>
		{/if}
	</li>
{/snippet}

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

	<form class="flex gap-2" onsubmit={handleCreateFolder}>
		<div class="flex-1">
			<Input placeholder="New folder name" bind:value={newFolderName} />
		</div>
		<Button type="submit" disabled={creatingFolder || !newFolderName.trim()}>New folder</Button>
	</form>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if lists.length === 0 && folders.length === 0}
		<p class="text-gray-600 dark:text-gray-400">No lists yet — tap + to create one.</p>
	{:else}
		<div class="flex flex-col gap-6">
			{#each groups as group (group.folder.id)}
				<section>
					<h2 class="mb-2 flex items-center gap-2 text-sm font-semibold">
						<span
							class="h-3 w-3 shrink-0 rounded-full"
							style:background-color={group.folder.color}
							aria-hidden="true"
						></span>
						<span>{group.folder.name}</span>
						<button
							type="button"
							class="ml-auto text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => handleDeleteFolder(group.folder)}
						>
							Delete folder
						</button>
					</h2>
					{#if group.lists.length === 0}
						<p class="text-xs text-gray-400">No lists in this folder yet.</p>
					{:else}
						<ul class="flex flex-col gap-2">
							{#each group.lists as list (list.id)}
								{@render listCard(list)}
							{/each}
						</ul>
					{/if}
				</section>
			{/each}

			{#if unfiledLists.length > 0}
				<section>
					{#if folders.length > 0}
						<h2 class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
							Not in a folder
						</h2>
					{/if}
					<ul class="flex flex-col gap-2">
						{#each unfiledLists as list (list.id)}
							{@render listCard(list)}
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	{/if}
</main>
