<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Checkbox } from 'flowbite-svelte';
	import type { ListDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchLists } from '$lib/api/lists';
	import { configureWidget } from '$lib/widget';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let lists = $state<ListDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let selectedListIds = $state<number[]>([]);
	let creating = $state(false);
	let handedOff = $state(false);

	// Minting the widget's PAT requires owning every list it's scoped to (the
	// PersonalAccessTokensController gates on it), so only owned lists are offered,
	// mirroring the Access Tokens page.
	const ownedLists = $derived(lists.filter((list) => list.role === 'owner'));

	async function loadAll() {
		loading = true;
		try {
			lists = await fetchLists();
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
		void loadAll();
	});

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		creating = true;
		error = null;
		try {
			handedOff = await configureWidget(selectedListIds);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to set up the widget.';
		} finally {
			creating = false;
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Home-screen widget" backHref={resolve('/settings')} />

	<p class="text-sm text-gray-600 dark:text-gray-400">
		Add an EveryList widget to your Android home screen. It shows a list's items with a checkbox to
		tick things off, a + button to add, and a tap on any row to open it — like Google Tasks. Pick
		which lists the widget can see; it can add and check off items on them.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if handedOff}
		<div
			class="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
		>
			Widget set up — find it in your widget picker and place it on your home screen, then pick
			which list it shows. You can manage (or revoke) the "Home-screen widget" access token any time
			on the <a class="underline" href={resolve('/settings/tokens')}>Access Tokens</a> page.
		</div>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if ownedLists.length === 0}
		<p class="text-sm text-gray-600 dark:text-gray-400">
			You need to own a list before you can set up the widget for it.
		</p>
	{:else}
		<form class="flex flex-col gap-2" onsubmit={handleCreate}>
			<div class="flex flex-col gap-1">
				<span class="text-xs text-gray-500 dark:text-gray-400">Lists</span>
				<ul class="flex flex-col gap-1">
					{#each ownedLists as list (list.id)}
						<li>
							<Checkbox group={selectedListIds} value={list.id}>{list.name}</Checkbox>
						</li>
					{/each}
				</ul>
			</div>
			<Button
				type="submit"
				size="sm"
				class="mt-1 w-fit"
				disabled={creating || selectedListIds.length === 0}
			>
				{creating ? 'Setting up…' : 'Create widget'}
			</Button>
		</form>
	{/if}
</main>
