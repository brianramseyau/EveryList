<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Textarea } from 'flowbite-svelte';
	import { getToken } from '$lib/api/token';
	import { importItems } from '$lib/api/items';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));

	let importText = $state('');
	let importing = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
		}
	});

	async function save() {
		// Unlike lists/new's form-wrapped Save (tested via a raw 'submit' event
		// that bypasses the disabled button), this Save button lives in the
		// header actions, not a <form> around the Textarea — Enter must insert
		// a newline here, not submit. The `|| importing` half is reachable only
		// by a genuine double-invocation, which the disabled button already
		// prevents in every real interaction path.
		/* v8 ignore next */
		if (!importText.trim() || importing) return;
		importing = true;
		try {
			await importItems(listId, importText);
			await goto(resolve('/lists/[id]', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to import items.';
			importing = false;
		}
	}
</script>

<main
	class="mx-auto flex h-dvh app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader
		title="Paste Items"
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Cancel"
	>
		{#snippet actions()}
			<Button type="button" size="sm" disabled={importing || !importText.trim()} onclick={save}>
				{importing ? 'Saving…' : 'Save'}
			</Button>
		{/snippet}
	</PageHeader>

	<p class="text-sm text-gray-600 dark:text-gray-300">
		One item per line, or paste an AnyList export — category headers in caps with bulleted items
		underneath.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	<Textarea
		bind:value={importText}
		autofocus
		placeholder="One item per line, or paste an AnyList list"
		classes={{ div: 'flex flex-1 flex-col' }}
		class="h-[calc(100dvh-16rem)] resize-none"
	/>
</main>
