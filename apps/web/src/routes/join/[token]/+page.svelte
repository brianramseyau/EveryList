<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from 'flowbite-svelte';
	import type { ListInvitePreviewDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { acceptInvite, fetchInvitePreview } from '$lib/api/invites';
	import { ApiError } from '$lib/api/client';

	// `token` is always defined for a matched /join/[token] route — the `?? ''`
	// only satisfies the param type, so its false branch is unreachable at
	// runtime (same rationale as apps/api's User.initials `?? ''` fallback).
	/* v8 ignore next */
	const token = $derived(page.params.token ?? '');
	const nextPath = $derived(resolve('/join/[token]', { token }));
	// nextPath is always this app's own resolve('/join/[token]', …) output
	// round-tripped through a query param — safe, but not statically
	// verifiable by the lint rule, hence the ResolvedPathname cast (same
	// technique PageHeader.svelte's backHref prop uses).
	const loginHref = $derived(
		`${resolve('/login')}?next=${encodeURIComponent(nextPath)}` as ResolvedPathname
	);
	const signupHref = $derived(
		`${resolve('/signup')}?next=${encodeURIComponent(nextPath)}` as ResolvedPathname
	);

	let preview = $state<ListInvitePreviewDto | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let accepting = $state(false);

	onMount(() => {
		void loadPreview();
	});

	async function loadPreview() {
		loading = true;
		try {
			preview = await fetchInvitePreview(token);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'This invite link is invalid or expired.';
		} finally {
			loading = false;
		}
	}

	async function handleAccept() {
		accepting = true;
		try {
			const list = await acceptInvite(token);
			await goto(resolve('/lists/[id]', { id: String(list.id) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to accept the invite.';
			accepting = false;
		}
	}
</script>

<svelte:head>
	<title>Join a list — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-sm flex-col gap-4 p-8">
	<h1 class="text-2xl font-bold">Join a list</h1>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if preview}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			<strong>{preview.inviterName}</strong> invited you to
			<strong>{preview.listName}</strong>
			as a <span class="capitalize">{preview.role}</span>.
		</p>

		{#if getToken()}
			<Button type="button" disabled={accepting} onclick={handleAccept}>
				{accepting ? 'Joining…' : 'Accept & open list'}
			</Button>
		{:else}
			<p class="text-sm text-gray-600 dark:text-gray-300">Log in or sign up to accept.</p>
			<div class="flex gap-3">
				<a href={loginHref} class="text-primary-700 underline dark:text-primary-400">Log in</a>
				<a href={signupHref} class="text-primary-700 underline dark:text-primary-400">Sign up</a>
			</div>
		{/if}

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}
	{:else}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
