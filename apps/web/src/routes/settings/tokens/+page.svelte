<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Checkbox } from 'flowbite-svelte';
	import type { AccessTokenDto, ListDto, ListRole } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchLists } from '$lib/api/lists';
	import { createToken, fetchTokens, revokeToken } from '$lib/api/tokens';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let lists = $state<ListDto[]>([]);
	let tokens = $state<AccessTokenDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newTokenName = $state('');
	let newTokenListIds = $state<number[]>([]);
	let newTokenRole = $state<Exclude<ListRole, 'owner'>>('editor');
	let creating = $state(false);
	let lastCreatedToken = $state<string | null>(null);
	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	// Minting a token requires being an owner of every list it's scoped to
	// (apps/api's PersonalAccessTokensController gates on it), so only owned
	// lists are offered to pick from — an editor/viewer-only list would just
	// 403 the whole request.
	const ownedLists = $derived(lists.filter((list) => list.role === 'owner'));

	function listName(listId: number): string {
		return lists.find((list) => list.id === listId)?.name ?? `List #${listId}`;
	}

	// Mirrors the members page's "reveal once" pattern for invite links — the
	// plaintext token is only ever in this response, never again.
	async function copyToken(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// Clipboard access can be denied by the browser — the token is
			// still shown on the page, so this is a nice-to-have, not fatal.
		}
	}

	async function loadAll() {
		loading = true;
		try {
			[lists, tokens] = await Promise.all([fetchLists(), fetchTokens()]);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load tokens.';
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
		try {
			const created = await createToken(newTokenName.trim(), newTokenListIds, newTokenRole);
			tokens = [created, ...tokens];
			lastCreatedToken = created.token;
			newTokenName = '';
			newTokenListIds = [];
			await copyToken(created.token);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create token.';
		} finally {
			creating = false;
		}
	}

	async function handleRevoke(token: AccessTokenDto) {
		tokens = tokens.filter((current) => current.id !== token.id);
		try {
			await revokeToken(token.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to revoke token.';
			await loadAll();
		}
	}
</script>

<svelte:head>
	<title>Access Tokens — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-lg flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Access Tokens" backHref={resolve('/settings')} />

	<p class="text-sm text-gray-600 dark:text-gray-400">
		Tokens let third-party integrations — Home Assistant, Alexa — read and update lists on your
		behalf, without sharing your account password. Pick which lists a token can reach when you
		create it; it can't do more than an editor or viewer could on any of them.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else}
		{#if ownedLists.length === 0}
			<p class="text-sm text-gray-600 dark:text-gray-400">
				You need to own a list before you can create tokens for it.
			</p>
		{:else}
			<section class="flex flex-col gap-2">
				<h2 class="text-sm font-semibold">New token</h2>
				<form class="flex flex-col gap-2" onsubmit={handleCreate}>
					<input
						type="text"
						placeholder="Name (e.g. Home Assistant)"
						class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
						bind:value={newTokenName}
					/>

					<div class="flex flex-col gap-1">
						<span class="text-xs text-gray-500 dark:text-gray-400">Lists</span>
						<ul class="flex flex-col gap-1">
							{#each ownedLists as list (list.id)}
								<li>
									<Checkbox group={newTokenListIds} value={list.id}>{list.name}</Checkbox>
								</li>
							{/each}
						</ul>
					</div>

					<div class="flex gap-2">
						<select
							aria-label="Role"
							class="rounded border border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-800"
							bind:value={newTokenRole}
						>
							<option value="editor">Editor — can add/remove items</option>
							<option value="viewer">Viewer — read only</option>
						</select>
						<Button
							type="submit"
							size="sm"
							disabled={creating || !newTokenName.trim() || newTokenListIds.length === 0}
						>
							Create token
						</Button>
					</div>
				</form>

				{#if lastCreatedToken}
					<div
						class="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/30"
					>
						<p class="text-sm font-medium text-amber-900 dark:text-amber-200">
							Copy this token now — it won't be shown again.
						</p>
						<div class="flex items-center gap-2">
							<code
								class="min-w-0 flex-1 rounded bg-white px-2 py-1 text-xs break-all text-gray-700 dark:bg-gray-800 dark:text-gray-300"
							>
								{lastCreatedToken}
							</code>
							<Button type="button" size="sm" onclick={() => void copyToken(lastCreatedToken!)}>
								{copied ? 'Copied!' : 'Copy'}
							</Button>
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<section class="flex flex-col gap-2">
			<h2 class="text-sm font-semibold">Active tokens</h2>
			{#if tokens.length === 0}
				<p class="text-sm text-gray-600 dark:text-gray-400">No tokens yet.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each tokens as token (token.id)}
						<li
							class="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
						>
							<div class="flex flex-col">
								<span>{token.name}</span>
								<span class="text-xs text-gray-600 dark:text-gray-400">
									{token.grants
										.map((grant) => `${listName(grant.listId)} (${grant.role})`)
										.join(', ')}
								</span>
							</div>
							<button
								type="button"
								class="ml-auto text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
								onclick={() => handleRevoke(token)}
							>
								Revoke
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>
