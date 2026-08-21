<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { resetPassword } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';

	let password = $state('');
	let passwordConfirmation = $state('');
	let error = $state<string | null>(null);
	let submitted = $state(false);
	let submitting = $state(false);

	// This is a prerendered static route (adapter-static) — reading
	// url.searchParams during the server-side prerender pass throws, so the
	// token is only read in the browser after hydration.
	// The `: ''` branch only fires during the server-side prerender pass;
	// this component is only ever tested in the browser project (real
	// Chromium, `browser` always true there), so it's untestable here.
	/* v8 ignore next */
	const token = $derived(browser ? (page.url.searchParams.get('token') ?? '') : '');
	const loginHref = $derived(resolve('/login') as ResolvedPathname);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await resetPassword({ token, password, passwordConfirmation });
			submitted = true;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Reset password — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-sm flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<h1 class="text-2xl font-bold">Reset password</h1>

	{#if !token}
		<p class="text-sm text-red-600 dark:text-red-400">
			This password reset link is invalid or has expired. Request a new one to continue.
		</p>
		<a href={resolve('/forgot-password')} class="text-primary-700 underline dark:text-primary-400">
			Request a new link
		</a>
	{:else if submitted}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Your password has been reset. You can now log in with your new password.
		</p>
		<a href={loginHref} class="text-primary-700 underline dark:text-primary-400">Log in</a>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
			<div>
				<Label for="password" class="mb-2">New password</Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					required
					minlength={8}
					autocomplete="new-password"
				/>
			</div>
			<div>
				<Label for="passwordConfirmation" class="mb-2">Confirm new password</Label>
				<Input
					id="passwordConfirmation"
					type="password"
					bind:value={passwordConfirmation}
					required
					minlength={8}
					autocomplete="new-password"
				/>
			</div>

			{#if error}
				<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
			{/if}

			<Button type="submit" disabled={submitting}>
				{submitting ? 'Resetting…' : 'Reset password'}
			</Button>
		</form>
	{/if}
</main>
