<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { getToken } from '$lib/api/token';
	import { createCategory } from '$lib/api/categories';
	import { ApiError } from '$lib/api/client';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let name = $state('');
	let icon = $state('tag');
	let saving = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
		}
	});

	async function save() {
		if (!name.trim() || saving) return;
		saving = true;
		try {
			await createCategory(listId, { name: name.trim(), icon });
			await goto(resolve('/lists/[id]/categories', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create category.';
			saving = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
</script>

<svelte:head>
	<title>New Category — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title="New Category"
		backHref={resolve('/lists/[id]/categories', { id: String(listId) })}
		backLabel="Cancel"
	>
		{#snippet actions()}
			<Button type="button" size="sm" disabled={saving || !name.trim()} onclick={save}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div class="flex flex-col gap-1">
			<Label for="new-category-name">Category Name</Label>
			<Input id="new-category-name" placeholder="Category name" bind:value={name} autofocus />
		</div>

		<div class="flex items-center justify-between">
			<Label>Icon</Label>
			<IconPicker value={icon} onselect={(selected) => (icon = selected)} />
		</div>
	</form>
</main>
