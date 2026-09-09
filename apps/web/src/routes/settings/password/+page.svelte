<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Label, Input, Helper, Checkbox } from 'flowbite-svelte';
	import { changePassword } from '$lib/api/auth';
	import { getToken } from '$lib/api/token';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let currentPassword = $state('');
	let password = $state('');
	let passwordConfirmation = $state('');
	let signOutOtherDevices = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);
	let submitting = $state(false);

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
		}
	});

	function resetFields() {
		currentPassword = '';
		password = '';
		passwordConfirmation = '';
		signOutOtherDevices = false;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		success = false;
		submitting = true;
		try {
			await changePassword({
				currentPassword,
				password,
				passwordConfirmation,
				signOutOtherDevices
			});
			resetFields();
			success = true;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Change password" backHref={resolve('/settings')} />

	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div>
			<Label for="currentPassword" class="mb-2">Current password</Label>
			<Input
				id="currentPassword"
				type="password"
				bind:value={currentPassword}
				required
				autocomplete="current-password"
			/>
		</div>
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

		<div>
			<Checkbox bind:checked={signOutOtherDevices}>Sign out all other devices</Checkbox>
			<Helper class="mt-1">
				Use this if you think someone else might have access to your account. Leave it unchecked for
				a routine password change — this device stays signed in either way.
			</Helper>
		</div>

		{#if error}
			<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
		{/if}
		{#if success}
			<Helper class="text-green-600 dark:text-green-400">Your password has been changed.</Helper>
		{/if}

		<Button type="submit" disabled={submitting}>
			{submitting ? 'Changing…' : 'Change password'}
		</Button>
	</form>
</main>
