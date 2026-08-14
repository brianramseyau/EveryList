<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { login } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	// After accepting a join link while logged out, `next` sends the user
	// back to /join/[token] instead of the default /lists landing. This is a
	// prerendered static route (adapter-static) — reading url.searchParams
	// during the server-side prerender pass throws, so this only reads it in
	// the browser after hydration.
	// The `: null` branch only fires during the server-side prerender pass;
	// this component is only ever tested in the browser project (real
	// Chromium, `browser` always true there), so it's untestable here.
	/* v8 ignore next */
	const nextPath = $derived(browser ? page.url.searchParams.get('next') : null);
	// nextPath, when present, is always this app's own resolve('/join/[token]', …)
	// output round-tripped through a query param — safe, but not statically
	// verifiable by the lint rule, hence the ResolvedPathname cast (same
	// technique PageHeader.svelte's backHref prop uses).
	const signupHref = $derived(
		(nextPath
			? `${resolve('/signup')}?next=${encodeURIComponent(nextPath)}`
			: resolve('/signup')) as ResolvedPathname
	);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await login({ email, password });
			// nextPath, when present, is always this app's own resolve('/join/[token]', …)
			// output round-tripped through a query param — safe, but not statically
			// verifiable by the lint rule below.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(nextPath ?? resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Log in — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-sm flex-col gap-4 p-8">
	<h1 class="text-2xl font-bold">Log in</h1>

	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div>
			<Label for="email" class="mb-2">Email</Label>
			<Input id="email" type="email" bind:value={email} required autocomplete="email" />
		</div>
		<div>
			<Label for="password" class="mb-2">Password</Label>
			<Input
				id="password"
				type="password"
				bind:value={password}
				required
				autocomplete="current-password"
			/>
		</div>

		{#if error}
			<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
		{/if}

		<Button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</Button>
	</form>

	<p class="text-sm text-gray-600 dark:text-gray-300">
		Don't have an account?
		<a href={signupHref} class="text-primary-600 hover:underline dark:text-primary-400">Sign up</a>
	</p>
</main>
