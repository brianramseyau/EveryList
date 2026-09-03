<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button, Input } from 'flowbite-svelte';
	import type { ListDto } from '@everylist/shared';
	import { authenticateWithBiometrics, checkBiometry, type BiometryKind } from '$lib/biometrics';
	import { verifyPasscode } from '$lib/passcode';
	import Icon from './Icon.svelte';

	let { list, onunlock }: { list: ListDto; onunlock: () => void } = $props();

	let pin = $state('');
	let checking = $state(false);
	let error = $state(false);

	// Native biometric auto-prompt (PLAN_23_PHASE_BIOMETRIC_UNLOCK.md). Runs
	// once per gate appearance: a fresh instance of this component is mounted
	// both for the initial open and after every background re-lock (the parent
	// page's `{#if list.passcodeHash && !unlocked}` unmounts the gate while
	// unlocked), so plain component state gives the "re-prompt on re-lock,
	// never twice within one appearance" behavior for free. Web/PWA/Electron
	// builds never see any of this — checkBiometry() reports unavailable
	// there — and the PIN form below is the universal fallback everywhere.
	const BIOMETRIC_PROMPT_DELAY_MS = 250;
	let biometryType = $state<BiometryKind>('none');
	let prompting = $state(false);
	let biometricFailed = $state(false);
	let disposed = false;

	onMount(() => {
		void autoPromptBiometrics();
	});

	// No timer teardown needed: the delay only resolves an internal promise,
	// and every step below re-checks `disposed` before touching state — an
	// unmounted gate's flow simply drains out on the next timer tick.
	onDestroy(() => {
		disposed = true;
	});

	async function autoPromptBiometrics() {
		const { available, biometryType: type } = await checkBiometry();
		if (disposed || !available) return;
		biometryType = type;
		// Short delay so the WebView is interactive before the native sheet
		// drops in — prompting synchronously from onMount raced the gate's
		// first paint, leaving the system prompt over a blank page.
		await new Promise((resolve) => {
			setTimeout(resolve, BIOMETRIC_PROMPT_DELAY_MS);
		});
		if (disposed) return;
		prompting = true;
		const outcome = await authenticateWithBiometrics('Unlock this list');
		if (disposed) return;
		prompting = false;
		if (outcome === 'success') {
			onunlock();
		} else if (outcome === 'failed') {
			biometricFailed = true;
		}
		// 'cancelled' and 'unavailable' fall back silently — no error, no
		// auto-re-prompt until the next gate appearance (a fresh mount).
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!pin.trim()) return;
		// Always true in practice — PasscodeGate is only ever rendered by
		// [id]/+page.svelte when list.passcodeHash is set — kept only to
		// narrow the type for verifyPasscode below.
		/* v8 ignore next */
		if (!list.passcodeHash) return;
		checking = true;
		error = false;
		biometricFailed = false;
		try {
			const ok = await verifyPasscode(pin.trim(), list.passcodeHash);
			if (ok) {
				onunlock();
			} else {
				error = true;
				pin = '';
			}
		} finally {
			checking = false;
		}
	}
</script>

<div
	class="flex flex-col items-center gap-4 rounded-lg border border-gray-200 p-8 text-center dark:border-gray-700"
>
	<Icon name="lock" class="h-8 w-8 text-gray-400 dark:text-gray-600" />
	<div>
		<p class="font-medium">This list is locked</p>
		<p class="text-sm text-gray-600 dark:text-gray-400">Enter the passcode to view it.</p>
	</div>
	{#if prompting}
		<!-- Split per kind rather than interpolating a label: text
			interpolations compile with a null-fallback branch that a
			never-empty derived string can never cover. -->
		{#if biometryType === 'face'}
			<p class="text-sm text-gray-600 dark:text-gray-400">Unlock with Face ID…</p>
		{:else if biometryType === 'fingerprint'}
			<p class="text-sm text-gray-600 dark:text-gray-400">Unlock with Fingerprint…</p>
		{:else}
			<p class="text-sm text-gray-600 dark:text-gray-400">Unlock with Biometrics…</p>
		{/if}
	{/if}
	{#if biometricFailed}
		{#if biometryType === 'face'}
			<p class="text-sm text-red-600 dark:text-red-400">
				Face ID unlock didn't work. Enter the passcode.
			</p>
		{:else if biometryType === 'fingerprint'}
			<p class="text-sm text-red-600 dark:text-red-400">
				Fingerprint unlock didn't work. Enter the passcode.
			</p>
		{:else}
			<p class="text-sm text-red-600 dark:text-red-400">
				Biometrics unlock didn't work. Enter the passcode.
			</p>
		{/if}
	{/if}
	<form class="flex w-full max-w-xs flex-col gap-2" onsubmit={submit}>
		<Input
			type="password"
			inputmode="numeric"
			autocomplete="off"
			placeholder="Passcode"
			bind:value={pin}
			aria-label="Passcode"
		/>
		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">Incorrect passcode.</p>
		{/if}
		<Button type="submit" disabled={checking || !pin.trim()}>
			{checking ? 'Checking…' : 'Unlock'}
		</Button>
	</form>
</div>
