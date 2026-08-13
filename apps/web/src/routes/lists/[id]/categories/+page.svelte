<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input } from 'flowbite-svelte';
	import type { CategoryDto, ListDto } from '@everylist/shared';
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
	let newCategoryIcon = $state('');
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
		if (!newCategoryName.trim() || !newCategoryIcon.trim()) return;
		creating = true;
		try {
			const category = await createCategory(listId, {
				name: newCategoryName.trim(),
				icon: newCategoryIcon.trim()
			});
			categories = [...categories, category];
			newCategoryName = '';
			newCategoryIcon = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create category.';
		} finally {
			creating = false;
		}
	}

	async function saveCategory(category: CategoryDto) {
		saving = category.id;
		try {
			const saved = await updateCategory(listId, category.id, {
				name: category.name,
				icon: category.icon
			});
			categories = categories.map((current) => (current.id === category.id ? saved : current));
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

	async function move(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= categories.length) return;

		const reordered = [...categories];
		[reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
		categories = reordered;

		reordering = true;
		try {
			categories = await reorderCategories(
				listId,
				reordered.map((category) => category.id)
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
	<a
		href={resolve('/lists/[id]', { id: String(listId) })}
		class="text-primary-600 dark:text-primary-400 text-sm hover:underline">← Back to list</a
	>

	{#if loading}
		<p class="text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if list}
		<h1 class="text-2xl font-bold">{list.name} — Categories</h1>
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Rename, reorder, or add categories. Renaming a default category creates a copy that's
			customized just for this list.
		</p>

		<form class="flex gap-2" onsubmit={handleCreate}>
			<Input placeholder="New category name" bind:value={newCategoryName} class="flex-1" />
			<Input placeholder="Icon name" bind:value={newCategoryIcon} class="w-32" />
			<Button
				type="submit"
				disabled={creating || !newCategoryName.trim() || !newCategoryIcon.trim()}>Add</Button
			>
		</form>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<ul class="flex flex-col gap-2">
			{#each categories as category, index (category.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
				>
					<div class="flex flex-col">
						<button
							type="button"
							class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
							disabled={index === 0 || reordering}
							onclick={() => move(index, -1)}
							aria-label="Move up"
						>
							▲
						</button>
						<button
							type="button"
							class="text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
							disabled={index === categories.length - 1 || reordering}
							onclick={() => move(index, 1)}
							aria-label="Move down"
						>
							▼
						</button>
					</div>

					<Input bind:value={category.name} class="flex-1" />
					<Input bind:value={category.icon} class="w-28" />

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
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
