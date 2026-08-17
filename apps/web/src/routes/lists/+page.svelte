<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { FolderDto, ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchLists, updateList, reorderLists } from '$lib/api/lists';
	import { fetchFolders } from '$lib/api/folders';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PopoutMenu from '$lib/components/PopoutMenu.svelte';
	import { sortableReorder } from '$lib/actions/sortable-reorder';

	let lists = $state<ListDto[]>([]);
	let folders = $state<FolderDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let reordering = $state(false);

	// Coarse (touch) pointers reorder via press-and-hold on the row itself, so
	// the explicit handle icon is only shown for fine pointers — same
	// precedent as the item-row drag handle on the single-list page.
	let isCoarsePointer = $state(false);

	// One shared group across every folder section (and "Not in a folder") so
	// SortableJS allows drops between them — dragging a list into a folder
	// (including an empty one) reassigns its folderId, matching AnyList's
	// drag-to-recategorize and the item-level cross-category drag on the
	// single-list page.
	const LISTS_GROUP = 'lists';

	// Fires once, on release, with the dragged list's new folder (from the
	// destination `<ul>`'s data-container-id) and its new immediate neighbors
	// there (see sortable-reorder.ts).
	async function handleDrop(params: {
		itemId: number;
		toContainerId: number | null;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const dragged = lists.find((list) => list.id === params.itemId);
		/* v8 ignore next */
		if (!dragged) return;

		const folderChanged = dragged.folderId !== params.toContainerId;
		const updatedDragged = folderChanged ? { ...dragged, folderId: params.toContainerId } : dragged;

		const withoutDragged = lists.filter((list) => list.id !== dragged.id);
		const beforeList = withoutDragged.find((list) => list.id === params.beforeItemId);
		const afterList = withoutDragged.find((list) => list.id === params.afterItemId);
		const insertAt = beforeList
			? withoutDragged.indexOf(beforeList) + 1
			: afterList
				? withoutDragged.indexOf(afterList)
				: withoutDragged.length;
		withoutDragged.splice(insertAt, 0, updatedDragged);
		lists = withoutDragged;

		reordering = true;
		try {
			if (folderChanged) await updateList(dragged.id, { folderId: params.toContainerId });
			lists = await reorderLists(lists.map((list) => list.id));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to reorder lists.';
			void loadAll();
		} finally {
			reordering = false;
		}
	}

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
		isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
		void loadAll();
	});
</script>

{#snippet listCard(list: ListDto)}
	<li data-item-id={list.id}>
		<a
			href={resolve('/lists/[id]', { id: String(list.id) })}
			class="flex items-center gap-3 rounded-lg border border-l-4 border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:hover:border-gray-600"
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
			{#if list.role && list.role !== 'owner'}
				<span
					class="flex shrink-0 items-center gap-1 text-xs text-gray-400"
					title={`Shared by ${list.ownerName ?? 'someone else'} · ${list.role === 'viewer' ? 'View only' : 'Can edit'}`}
				>
					<Icon name="accountMultiple" class="h-4 w-4" />
					<span>{list.role === 'viewer' ? 'View only' : 'Shared'}</span>
				</span>
			{:else if list.memberCount && list.memberCount > 1}
				<span
					class="shrink-0 text-gray-400"
					title={`Shared with ${list.memberCount - 1} other${list.memberCount - 1 === 1 ? '' : 's'}`}
				>
					<Icon name="accountMultiple" class="h-4 w-4" />
					<span class="sr-only">Shared</span>
				</span>
			{/if}
			{#if list.passcodeHash}
				<span class="shrink-0 text-gray-400" title="Passcode protected">
					<Icon name="lock" class="h-4 w-4" />
					<span class="sr-only">Passcode protected</span>
				</span>
			{/if}
			{#if list.archived}
				<span class="text-xs text-gray-400">Archived</span>
			{/if}
			{#if !isCoarsePointer}
				<span
					aria-hidden="true"
					class="flex h-11 w-6 shrink-0 items-center justify-center text-gray-300 dark:text-gray-600"
				>
					<Icon name="dragVertical" class="h-5 w-5" />
				</span>
			{/if}
		</a>
	</li>
{/snippet}

<svelte:head>
	<title>My Lists — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader title="My Lists">
		{#snippet actions()}
			<PopoutMenu label="Create" iconName="plus">
				<a
					href={resolve('/lists/new')}
					class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
				>
					Create List
				</a>
				<a
					href={resolve('/lists/folders/new')}
					class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
				>
					Create Folder
				</a>
			</PopoutMenu>
			{#if folders.length > 0}
				<a
					href={resolve('/lists/folders')}
					aria-label="Manage folders"
					class="flex h-11 w-11 items-center justify-center text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
				>
					<Icon name="cog" class="h-6 w-6" />
				</a>
			{/if}
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if lists.length === 0 && folders.length === 0}
		<p class="text-gray-600 dark:text-gray-400">No lists yet — tap + to create one.</p>
	{:else}
		<p class="text-xs text-gray-400">Press and hold a list to drag it into place.</p>

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
					</h2>
					<ul
						class="flex min-h-14 flex-col gap-2 {group.lists.length === 0
							? 'rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700'
							: ''}"
						data-container-id={group.folder.id}
						use:sortableReorder={{ group: LISTS_GROUP, disabled: reordering, onDrop: handleDrop }}
					>
						{#each group.lists as list (list.id)}
							{@render listCard(list)}
						{/each}
						{#if group.lists.length === 0}
							<li class="flex h-14 items-center px-4 text-xs text-gray-400" data-reorder-ignore>
								Drag a list here to add it to this folder.
							</li>
						{/if}
					</ul>
				</section>
			{/each}

			<!-- Always rendered here: with no folders, unfiledLists === lists, which
			     is non-empty whenever this {:else} branch itself is reached
			     (the sibling empty-state check above already covers the only
			     case where both would be empty). -->
			<section>
				{#if folders.length > 0}
					<h2 class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
						Not in a folder
					</h2>
				{/if}
				<ul
					class="flex min-h-14 flex-col gap-2"
					data-container-id="null"
					use:sortableReorder={{ group: LISTS_GROUP, disabled: reordering, onDrop: handleDrop }}
				>
					{#each unfiledLists as list (list.id)}
						{@render listCard(list)}
					{/each}
					{#if unfiledLists.length === 0}
						<li class="flex h-14 items-center px-4 text-xs text-gray-400" data-reorder-ignore>
							Drag a list here to remove it from its folder.
						</li>
					{/if}
				</ul>
			</section>
		</div>
	{/if}
</main>
