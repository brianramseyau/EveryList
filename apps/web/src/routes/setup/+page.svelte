<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import type { BackupFrequency } from '@everylist/shared';
	import { completeSetup, fetchSetupStatus } from '$lib/api/setup';
	import { ApiError } from '$lib/api/client';
	import Loader from '$lib/components/Loader.svelte';

	// Matches BackupSetting.current()'s own hardcoded defaults (see apps/api's
	// backup_setting.ts) — only used if the status fetch below fails, since a fresh instance still
	// needs a usable wizard even when it can't be told the server's real defaults ahead of time.
	const FALLBACK_BACKUP_DEFAULTS = {
		frequency: 'weekly' as BackupFrequency,
		timeOfDay: '03:00',
		retentionCount: 4
	};

	type Step = 'account' | 'backup';

	let step = $state<Step>('account');
	let checkingAccess = $state(true);

	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirmation = $state('');

	let frequency = $state<BackupFrequency>(FALLBACK_BACKUP_DEFAULTS.frequency);
	let timeOfDay = $state(FALLBACK_BACKUP_DEFAULTS.timeOfDay);
	let retentionCount = $state(FALLBACK_BACKUP_DEFAULTS.retentionCount);

	let error = $state<string | null>(null);
	let submitting = $state(false);

	onMount(async () => {
		try {
			const status = await fetchSetupStatus();
			if (!status.needsSetup) {
				await goto(resolve('/login'), { replaceState: true });
				return;
			}
			frequency = status.defaultBackupSettings.frequency;
			timeOfDay = status.defaultBackupSettings.timeOfDay;
			retentionCount = status.defaultBackupSettings.retentionCount;
		} catch {
			// Fail open (same reasoning as login/signup's fetchMeta fallback) — the wizard still
			// renders with hardcoded defaults, and POST /api/v1/setup re-validates server-side
			// regardless, so this can never actually re-run setup that's already done.
		} finally {
			checkingAccess = false;
		}
	});

	function handleContinue(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		step = 'backup';
	}

	function handleBack() {
		error = null;
		step = 'account';
	}

	async function handleFinish(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			await completeSetup({
				fullName: fullName.trim() || null,
				email,
				password,
				passwordConfirmation,
				backup: { frequency, timeOfDay, retentionCount }
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
	<title>Set up EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-sm flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<h1 class="text-2xl font-bold">Welcome to EveryList</h1>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		Let's set up this instance. First, create your account.
	</p>

	{#if checkingAccess}
		<Loader />
	{:else if step === 'account'}
		<form class="flex flex-col gap-4" onsubmit={handleContinue}>
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

			<Button type="submit">Continue</Button>
		</form>
	{:else}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Confirm the backup schedule for this instance. You can change this later from Settings →
			Backups.
		</p>

		<form class="flex flex-col gap-4" onsubmit={handleFinish}>
			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Frequency</span>
				<select
					aria-label="Frequency"
					class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					bind:value={frequency}
				>
					<option value="daily">Daily</option>
					<option value="weekly">Weekly (Sunday)</option>
					<option value="monthly">Monthly (1st)</option>
				</select>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Time of day</span>
				<input
					type="time"
					aria-label="Time of day"
					class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					bind:value={timeOfDay}
				/>
			</label>

			<label class="flex flex-col gap-1 text-sm">
				<span class="font-medium">Backups to keep</span>
				<input
					type="number"
					min="1"
					max="60"
					aria-label="Backups to keep"
					class="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
					bind:value={retentionCount}
				/>
			</label>

			{#if error}
				<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
			{/if}

			<div class="flex items-center gap-2">
				<Button type="button" color="alternative" onclick={handleBack} disabled={submitting}>
					Back
				</Button>
				<Button type="submit" disabled={submitting} class="flex-1">
					{submitting ? 'Setting up…' : 'Finish setup'}
				</Button>
			</div>
		</form>
	{/if}
</main>
