<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { FolderDto } from '@everylist/shared';
	import Icon from '$lib/components/Icon.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { sortableReorder } from '$lib/actions/sortable-reorder';
	import { getToken } from '$lib/api/token';
	import { createFolder, deleteFolder, fetchFolders, reorderFolders, updateFolder } from '$lib/api/folders';
	import { ApiError } from '$lib/api/client';

	const DEFAULT_COLOR = '#3b82f6';

	let folders = $state<FolderDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let reordering = $state(false);

	let newFolderName = $state('');
	let newFolderColor = $state(DEFAULT_COLOR);
	let creating = $state(false);

	// Tracks each row's name at the moment it gained focus, so blur can skip
	// saving when nothing actually changed — same pattern as the categories
	// management page.
	const editStartNames = new SvelteMap<number, string>();

	async function loadAll() {
		loading = true;
		try {
			folders = await fetchFolders();
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load folders.';
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
		if (!newFolderName.trim()) return;
		creating = true;
		try {
			const folder = await createFolder({ name: newFolderName.trim(), color: newFolderColor });
			folders = [...folders, folder];
			newFolderName = '';
			newFolderColor = DEFAULT_COLOR;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create folder.';
		} finally {
			creating = false;
		}
	}

	async function saveFolder(folder: FolderDto, input: Partial<{ name: string; color: string }>) {
		try {
			const saved = await updateFolder(folder.id, input);
			folders = folders.map((current) => (current.id === folder.id ? saved : current));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save folder.';
			void loadAll();
		}
	}

	function handleNameFocus(folder: FolderDto) {
		editStartNames.set(folder.id, folder.name);
	}

	function handleNameBlur(folder: FolderDto) {
		const original = editStartNames.get(folder.id);
		editStartNames.delete(folder.id);
		if (original !== undefined && folder.name !== original) {
			void saveFolder(folder, { name: folder.name });
		}
	}

	function handleColorSelect(folder: FolderDto, color: string) {
		folder.color = color;
		void saveFolder(folder, { color });
	}

	async function removeFolder(folder: FolderDto) {
		folders = folders.filter((current) => current.id !== folder.id);
		try {
			await deleteFolder(folder.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete folder.';
			void loadAll();
		}
	}

	// Fires once, on release, with the dragged folder's new immediate
	// neighbors (see sortable-reorder.ts) — placed among them, then the whole
	// resulting order is sent to reorderFolders, which renumbers every row.
	async function handleDrop(params: {
		itemId: number;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const dragged = folders.find((current) => current.id === params.itemId);
		/* v8 ignore next */
		if (!dragged) return;

		const withoutDragged = folders.filter((current) => current.id !== dragged.id);
		const beforeFolder = withoutDragged.find((current) => current.id === params.beforeItemId);
		const afterFolder = withoutDragged.find((current) => current.id === params.afterItemId);
		const insertAt = beforeFolder
			? withoutDragged.indexOf(beforeFolder) + 1
			: afterFolder
				? withoutDragged.indexOf(afterFolder)
				: withoutDragged.length;
		withoutDragged.splice(insertAt, 0, dragged);
		folders = withoutDragged;

		reordering = true;
		try {
			folders = await reorderFolders(folders.map((folder) => folder.id));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to reorder folders.';
			void loadAll();
		} finally {
			reordering = false;
		}
	}
</script>

<svelte:head>
	<title>Manage Folders — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader title="Manage Folders" backHref={resolve('/lists')} backLabel="Back to lists" />

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else}
		<p class="text-sm text-gray-600 dark:text-gray-300">Rename, recolor, reorder, or delete folders.</p>

		<form class="flex gap-2" onsubmit={handleCreate}>
			<div class="flex-1">
				<Input placeholder="New folder name" bind:value={newFolderName} />
			</div>
			<ColorPicker value={newFolderColor} onselect={(color) => (newFolderColor = color)} />
			<Button type="submit" disabled={creating || !newFolderName.trim()}>Add</Button>
		</form>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		{#if folders.length === 0}
			<p class="text-gray-600 dark:text-gray-400">No folders yet — add one above.</p>
		{:else}
			<p class="text-xs text-gray-400">Press and hold a folder's handle to drag it into place.</p>

			<ul
				class="flex flex-col gap-2"
				use:sortableReorder={{ group: 'folders', disabled: reordering, onDrop: handleDrop }}
			>
				{#each folders as folder (folder.id)}
					<li
						class="flex items-center gap-2 rounded-lg border border-gray-200 bg-paper p-3 dark:border-gray-700"
						data-item-id={folder.id}
					>
						<span
							aria-hidden="true"
							class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 dark:text-gray-600"
						>
							<Icon name="dragVertical" class="h-5 w-5" />
						</span>

						<div class="flex-1" data-reorder-ignore>
							<Input
								bind:value={folder.name}
								onfocus={() => handleNameFocus(folder)}
								onblur={() => handleNameBlur(folder)}
							/>
						</div>
						<div data-reorder-ignore>
							<ColorPicker
								value={folder.color}
								onselect={(color) => handleColorSelect(folder, color)}
							/>
						</div>

						<button
							type="button"
							data-reorder-ignore
							class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => removeFolder(folder)}
						>
							Delete
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>
