<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { forgotPassword } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';

	let email = $state('');
	let error = $state<string | null>(null);
	let submitted = $state(false);
	let submitting = $state(false);

	const loginHref = $derived(resolve('/login') as ResolvedPathname);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await forgotPassword({ email });
			submitted = true;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Forgot password — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-sm flex-col gap-4 p-8">
	<h1 class="text-2xl font-bold">Forgot password</h1>

	{#if submitted}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			If an account exists for <strong>{email}</strong>, we've sent a link to reset your password.
			Check your inbox (and spam folder) — the link expires in 60 minutes.
		</p>
		<a href={loginHref} class="text-primary-700 underline dark:text-primary-400">Back to log in</a>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
			<div>
				<Label for="email" class="mb-2">Email</Label>
				<Input id="email" type="email" bind:value={email} required autocomplete="email" />
			</div>

			{#if error}
				<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
			{/if}

			<Button type="submit" disabled={submitting}>
				{submitting ? 'Sending…' : 'Send reset link'}
			</Button>
		</form>
	{/if}

	<p class="text-sm text-gray-600 dark:text-gray-300">
		Remembered it?
		<a href={loginHref} class="text-primary-700 underline dark:text-primary-400">Log in</a>
	</p>
</main>
