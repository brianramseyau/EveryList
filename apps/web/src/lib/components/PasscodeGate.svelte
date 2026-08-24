<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import type { ListDto } from '@everylist/shared';
	import { verifyPasscode } from '$lib/passcode';
	import Icon from './Icon.svelte';

	let { list, onunlock }: { list: ListDto; onunlock: () => void } = $props();

	let pin = $state('');
	let checking = $state(false);
	let error = $state(false);

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
