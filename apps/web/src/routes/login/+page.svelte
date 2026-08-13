<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { login } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await login({ email, password });
			await goto(resolve('/lists'));
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
		Don't have an account? <a
			href={resolve('/signup')}
			class="text-primary-600 hover:underline dark:text-primary-400">Sign up</a
		>
	</p>
</main>
