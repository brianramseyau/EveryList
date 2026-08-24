<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Input } from 'flowbite-svelte';
	import type { CategoryDto, ListDto } from '@everylist/shared';
	import Icon from '$lib/components/Icon.svelte';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PopoutMenu from '$lib/components/PopoutMenu.svelte';
	import { sortableReorder } from '$lib/actions/sortable-reorder';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import {
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
	let reordering = $state(false);

	// Tracks each row's name at the moment it gained focus, so blur can skip
	// saving when nothing actually changed (user confirmed onBlur over
	// debounced oninput — PHASE11_PLAN.md §F).
	const editStartNames = new SvelteMap<number, string>();

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

	async function saveCategory(category: CategoryDto) {
		try {
			const input = { name: category.name, icon: category.icon };
			const saved = await updateCategory(listId, category.id, input);
			categories = categories.map((current) =>
				current.id === category.id ? (saved ?? { ...current, ...input }) : current
			);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save category.';
			void loadAll();
		}
	}

	function handleNameFocus(category: CategoryDto) {
		editStartNames.set(category.id, category.name);
	}

	function handleNameBlur(category: CategoryDto) {
		const original = editStartNames.get(category.id);
		editStartNames.delete(category.id);
		if (original !== undefined && category.name !== original) {
			void saveCategory(category);
		}
	}

	function handleIconSelect(category: CategoryDto, icon: string) {
		category.icon = icon;
		void saveCategory(category);
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

	// Fires once, on release, with the dragged category's new immediate
	// neighbors (see sortable-reorder.ts) — placed among them, then the
	// whole resulting order is sent to reorderCategories, which renumbers
	// every row (safe here: categories have no offline-sync version-conflict
	// concern the way items do, and this endpoint already worked this way).
	async function handleDrop(params: {
		itemId: number;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const dragged = categories.find((current) => current.id === params.itemId);
		/* v8 ignore next */
		if (!dragged) return;

		const withoutDragged = categories.filter((current) => current.id !== dragged.id);
		const beforeCategory = withoutDragged.find((current) => current.id === params.beforeItemId);
		const afterCategory = withoutDragged.find((current) => current.id === params.afterItemId);
		const insertAt = beforeCategory
			? withoutDragged.indexOf(beforeCategory) + 1
			: afterCategory
				? withoutDragged.indexOf(afterCategory)
				: withoutDragged.length;
		withoutDragged.splice(insertAt, 0, dragged);
		categories = withoutDragged;

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

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title={list ? `${list.name} — Categories` : undefined}
		backHref={resolve('/lists/[id]/settings', { id: String(listId) })}
		backLabel="Back to settings"
	>
		{#snippet actions()}
			<PopoutMenu label="Create" iconName="plus">
				<a
					href={resolve('/lists/[id]/categories/new', { id: String(listId) })}
					class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
				>
					Create
				</a>
				<a
					href={resolve('/lists/[id]/categories/import', { id: String(listId) })}
					class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
				>
					Import
				</a>
				<a
					href={resolve('/lists/[id]/categories/paste', { id: String(listId) })}
					class="block rounded px-2 py-1.5 text-sm text-primary-700 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
				>
					Paste
				</a>
			</PopoutMenu>
		{/snippet}
	</PageHeader>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Rename, reorder, or add categories. Renaming a default category creates a copy that's
			customized just for this list.
		</p>

		<p class="text-xs text-gray-400">Press and hold a category's handle to drag it into place.</p>

		<ul
			class="flex flex-col gap-2"
			use:sortableReorder={{ group: 'categories', disabled: reordering, onDrop: handleDrop }}
		>
			{#each categories as category (category.id)}
				<li
					class="flex items-center gap-2 rounded-lg border border-gray-200 bg-paper p-3 dark:border-gray-700"
					data-item-id={category.id}
				>
					<span
						aria-hidden="true"
						class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 dark:text-gray-600"
					>
						<Icon name="dragVertical" class="h-5 w-5" />
					</span>

					<div class="flex-1" data-reorder-ignore>
						<Input
							bind:value={category.name}
							onfocus={() => handleNameFocus(category)}
							onblur={() => handleNameBlur(category)}
						/>
					</div>
					<div data-reorder-ignore>
						<IconPicker
							value={category.icon}
							onselect={(name) => handleIconSelect(category, name)}
						/>
					</div>

					{#if category.listId === listId}
						<button
							type="button"
							data-reorder-ignore
							aria-label="Delete category"
							class="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
							onclick={() => removeCategory(category)}
						>
							<Icon name="delete" class="h-5 w-5" />
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
