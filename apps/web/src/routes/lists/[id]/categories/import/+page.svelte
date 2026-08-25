<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Checkbox, Select } from 'flowbite-svelte';
	import type { CategoryDto, ListDto } from '@everylist/shared';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { getToken } from '$lib/api/token';
	import { fetchLists } from '$lib/api/lists';
	import { fetchCategories, importCategories } from '$lib/api/categories';
	import { ApiError } from '$lib/api/client';

	const listId = $derived(Number(page.params.id));

	let lists = $state<ListDto[]>([]);
	let sourceListId = $state<number | null>(null);
	let sourceCategories = $state<CategoryDto[]>([]);
	let selectedIds = $state<number[]>([]);
	let loadingLists = $state(true);
	let loadingCategories = $state(false);
	let importing = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		void loadLists();
	});

	async function loadLists() {
		loadingLists = true;
		try {
			const all = await fetchLists();
			lists = all.filter((list) => list.id !== listId);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load lists.';
		} finally {
			loadingLists = false;
		}
	}

	async function loadCategories(listToLoad: number) {
		loadingCategories = true;
		error = null;
		try {
			sourceCategories = await fetchCategories(listToLoad);
			selectedIds = sourceCategories.map((category) => category.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load categories.';
		} finally {
			loadingCategories = false;
		}
	}

	function handleSourceChange(event: Event) {
		const raw = Number((event.target as HTMLSelectElement).value);
		sourceListId = raw;
		void loadCategories(raw);
	}

	async function save() {
		// The Import button is disabled while nothing is selected, so this is a
		// defensive guard against a programmatic invocation rather than a
		// reachable state (same reasoning as the items import page).
		/* v8 ignore next */
		if (sourceListId === null || selectedIds.length === 0 || importing) return;
		importing = true;
		try {
			await importCategories(listId, { sourceListId, categoryIds: selectedIds });
			await goto(resolve('/lists/[id]/categories', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to import categories.';
			importing = false;
		}
	}
</script>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title="Import Categories"
		backHref={resolve('/lists/[id]/categories', { id: String(listId) })}
		backLabel="Cancel"
	>
		{#snippet actions()}
			<Button
				type="button"
				size="sm"
				disabled={importing || selectedIds.length === 0}
				onclick={save}
			>
				{importing ? 'Importing…' : 'Import'}
			</Button>
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loadingLists}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if lists.length === 0}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			You don't have any other lists to copy categories from yet.
		</p>
	{:else}
		<div class="flex flex-col gap-1">
			<span class="text-xs text-gray-500 dark:text-gray-400">Copy categories from</span>
			<Select
				size="sm"
				items={lists.map((list) => ({ value: list.id, name: list.name }))}
				value={sourceListId ?? ''}
				onchange={handleSourceChange}
			/>
		</div>

		{#if loadingCategories}
			<p class="text-gray-600 dark:text-gray-400">Loading categories…</p>
		{:else if sourceCategories.length === 0}
			<p class="text-sm text-gray-600 dark:text-gray-300">This list has no categories to import.</p>
		{:else}
			<p class="text-sm text-gray-600 dark:text-gray-300">
				Categories that already exist on this list will be skipped.
			</p>

			<ul class="flex flex-col gap-2">
				{#each sourceCategories as category (category.id)}
					<li class="rounded-lg border border-gray-200 bg-paper p-3 dark:border-gray-700">
						<Checkbox group={selectedIds} value={category.id}>
							<span class="inline-flex items-center gap-2"
								><Icon name={category.icon} class="h-5 w-5" />{category.name}</span
							>
						</Checkbox>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>
