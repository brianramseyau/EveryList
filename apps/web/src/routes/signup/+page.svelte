<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { signup } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';

	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirmation = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await signup({
				fullName: fullName.trim() || null,
				email,
				password,
				passwordConfirmation
			});
			await goto(resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Sign up — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-sm flex-col gap-4 p-8">
	<h1 class="text-2xl font-bold">Sign up</h1>

	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div>
			<Label for="fullName" class="mb-2">Name (optional)</Label>
			<Input id="fullName" bind:value={fullName} autocomplete="name" />
		</div>
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
				minlength={8}
				autocomplete="new-password"
			/>
		</div>
		<div>
			<Label for="passwordConfirmation" class="mb-2">Confirm password</Label>
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

		<Button type="submit" disabled={submitting}>{submitting ? 'Signing up…' : 'Sign up'}</Button>
	</form>

	<p class="text-sm text-gray-600 dark:text-gray-300">
		Already have an account? <a
			href={resolve('/login')}
			class="text-primary-600 hover:underline dark:text-primary-400">Log in</a
		>
	</p>
</main>
