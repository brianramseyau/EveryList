<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { getToken } from '$lib/api/token';
	import { attachStore } from '$lib/api/stores';
	import { ApiError } from '$lib/api/client';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const DEFAULT_COLOR = '#3b82f6';

	const listId = $derived(Number(page.params.id));

	let name = $state('');
	let color = $state(DEFAULT_COLOR);
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
			await attachStore(listId, { name: name.trim(), color });
			await goto(resolve('/lists/[id]/stores', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create store.';
			saving = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
</script>

<svelte:head>
	<title>New Store — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title="New Store"
		backHref={resolve('/lists/[id]/stores', { id: String(listId) })}
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
			<Label for="new-store-name">Store Name</Label>
			<Input id="new-store-name" placeholder="Store name" bind:value={name} autofocus />
		</div>

		<div class="flex items-center justify-between">
			<Label>Color</Label>
			<ColorPicker value={color} onselect={(selected) => (color = selected)} />
		</div>
	</form>
</main>
