<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input, Label, Toggle } from 'flowbite-svelte';
	import { getToken } from '$lib/api/token';
	import { createList } from '$lib/api/lists';
	import { ApiError } from '$lib/api/client';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const DEFAULT_COLOR = '#3b82f6';
	const DEFAULT_ICON = 'formatListChecks';

	let name = $state('');
	let color = $state(DEFAULT_COLOR);
	let icon = $state(DEFAULT_ICON);
	let useCategories = $state(true);
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
			await createList({ name: name.trim(), color, icon, useCategories });
			await goto(resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create list.';
			saving = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
</script>

<svelte:head>
	<title>New List — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="New List" backHref={resolve('/lists')} backLabel="Cancel">
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
			<Label for="new-list-name">List Name</Label>
			<Input id="new-list-name" placeholder="List name" bind:value={name} autofocus />
		</div>

		<div class="flex items-center justify-between">
			<Label>Icon</Label>
			<IconPicker value={icon} onselect={(selected) => (icon = selected)} />
		</div>

		<div class="flex items-center justify-between">
			<Label>Theme</Label>
			<ColorPicker value={color} onselect={(selected) => (color = selected)} />
		</div>

		<div class="flex items-center justify-between">
			<Label for="new-list-use-categories">
				{useCategories ? 'Use categories' : 'Keep it simple'}
			</Label>
			<Toggle id="new-list-use-categories" bind:checked={useCategories} />
		</div>
	</form>
</main>
