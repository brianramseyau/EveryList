<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { CategoryDto, ListDto } from '@everylist/shared';
	import Icon from '$lib/components/Icon.svelte';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { pressHoldReorder } from '$lib/actions/press-hold-reorder';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import {
		createCategory,
		deleteCategory,
		fetchCategories,
		reorderCategories,
		updateCategory
	} from '$lib/api/categories';
	import { ApiError } from '$lib/api/client';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let categories = $state<CategoryDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state<number | null>(null);
	let reordering = $state(false);

	let newCategoryName = $state('');
	let newCategoryIcon = $state('tag');
	let creating = $state(false);

	async function loadAll() {
		loading = true;
		try {
			[list, categories] = await Promise.all([fetchList(listId), fetchCategories(listId)]);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load categories.';
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
		if (!newCategoryName.trim()) return;
		creating = true;
		try {
			const category = await createCategory(listId, {
				name: newCategoryName.trim(),
				icon: newCategoryIcon
			});
			categories = [...categories, category];
			newCategoryName = '';
			newCategoryIcon = 'tag';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create category.';
		} finally {
			creating = false;
		}
	}

	async function saveCategory(category: CategoryDto) {
		saving = category.id;
		try {
			const input = { name: category.name, icon: category.icon };
			const saved = await updateCategory(listId, category.id, input);
			categories = categories.map((current) =>
				current.id === category.id ? (saved ?? { ...current, ...input }) : current
			);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save category.';
			void loadAll();
		} finally {
			saving = null;
		}
	}

	async function removeCategory(category: CategoryDto) {
		categories = categories.filter((current) => current.id !== category.id);
		try {
			await deleteCategory(listId, category.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to delete category.';
			void loadAll();
		}
	}

	let listEl: HTMLUListElement | undefined = $state();
	let dragFromIndex: number | null = $state(null);

	function getItemRects(): DOMRect[] {
		// Only reachable before the list has ever rendered — the drag handle
		// this feeds doesn't exist yet either, so it can't be exercised.
		/* v8 ignore next */
		if (!listEl) return [];
		return [...listEl.children].map((child) => child.getBoundingClientRect());
	}

	function handleDragStart(fromIndex: number) {
		dragFromIndex = fromIndex;
	}

	function handleDragMove(toIndex: number) {
		// onmove only ever fires after onstart already set this — see
		// press-hold-reorder.ts's `startDragging`/`handlePointerMove`.
		/* v8 ignore next */
		if (dragFromIndex === null) return;
		if (toIndex === dragFromIndex) return;
		const reordered = [...categories];
		const [moved] = reordered.splice(dragFromIndex, 1);
		reordered.splice(toIndex > dragFromIndex ? toIndex - 1 : toIndex, 0, moved!);
		categories = reordered;
		dragFromIndex = toIndex > dragFromIndex ? toIndex - 1 : toIndex;
	}

	async function handleDrop() {
		dragFromIndex = null;
		reordering = true;
		try {
			categories = await reorderCategories(
				listId,
				categories.map((category) => category.id)
			);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to reorder categories.';
			void loadAll();
		} finally {
			reordering = false;
		}
	}
</script>

<svelte:head>
	<title>{list ? `${list.name} categories — EveryList` : 'Categories — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${list.name} — Categories` : undefined}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	/>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Rename, reorder, or add categories. Renaming a default category creates a copy that's
			customized just for this list.
		</p>

		<form class="flex gap-2" onsubmit={handleCreate}>
			<div class="flex-1">
				<Input placeholder="New category name" bind:value={newCategoryName} />
			</div>
			<IconPicker value={newCategoryIcon} onselect={(name) => (newCategoryIcon = name)} />
			<Button type="submit" disabled={creating || !newCategoryName.trim()}>Add</Button>
		</form>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<p class="text-xs text-gray-400">Press and hold a category's handle to drag it into place.</p>

		<ul class="flex flex-col gap-2" bind:this={listEl}>
			{#each categories as category, index (category.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<button
						type="button"
						aria-label={`Drag to reorder ${category.name}`}
						disabled={reordering}
						class="flex h-11 w-11 shrink-0 touch-none items-center justify-center text-gray-400 disabled:opacity-30"
						use:pressHoldReorder={{
							index,
							disabled: reordering,
							getItemRects,
							onstart: handleDragStart,
							onmove: handleDragMove,
							ondrop: handleDrop
						}}
					>
						<Icon name="dragVertical" class="h-5 w-5" />
					</button>

					<div class="flex-1">
						<Input bind:value={category.name} />
					</div>
					<IconPicker value={category.icon} onselect={(name) => (category.icon = name)} />

					<Button
						size="xs"
						disabled={saving === category.id}
						onclick={() => saveCategory(category)}
					>
						{saving === category.id ? 'Saving…' : 'Save'}
					</Button>

					{#if category.listId === listId}
						<button
							type="button"
							class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => removeCategory(category)}
						>
							Delete
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<!-- Reachable only once loadAll's finally has run: loading is false, and
		     its catch always sets `error` when it leaves `list` unset. -->
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
