<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Textarea } from 'flowbite-svelte';
	import { getToken } from '$lib/api/token';
	import { bulkImportCategories } from '$lib/api/categories';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let pasteText = $state('');
	let importing = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
		}
	});

	async function save() {
		// Save button lives in the header actions, not a <form> around the Textarea — Enter must
		// insert a newline here, not submit (same reasoning as the items paste page). The disabled
		// button already prevents a real double-invocation, so this is a defensive guard only.
		/* v8 ignore next */
		if (!pasteText.trim() || importing) return;
		importing = true;
		try {
			await bulkImportCategories(listId, pasteText);
			await goto(resolve('/lists/[id]/categories', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to import categories.';
			importing = false;
		}
	}
</script>

<main
	class="mx-auto flex h-dvh app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title="Paste Categories"
		backHref={resolve('/lists/[id]/categories', { id: String(listId) })}
		backLabel="Cancel"
	>
		{#snippet actions()}
			<Button type="button" size="sm" disabled={importing || !pasteText.trim()} onclick={save}>
				{importing ? 'Saving…' : 'Save'}
			</Button>
		{/snippet}
	</PageHeader>

	<p class="text-sm text-gray-600 dark:text-gray-300">
		One category per line. Each one gets matched to a relatable icon automatically — you can change
		it afterward from the categories list.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	<Textarea
		bind:value={pasteText}
		autofocus
		placeholder="One category per line"
		classes={{ div: 'flex flex-1 flex-col' }}
		class="h-[calc(100dvh-16rem)] resize-none"
	/>
</main>
