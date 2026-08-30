<script lang="ts">
	import { onMount } from 'svelte';
	import {
		requestShakePermission,
		shakeNeedsRepromptThisSession,
		startShakeListening
	} from '$lib/shake';
	import { runUndo } from '$lib/undo';
	import Icon from './Icon.svelte';

	// iOS Safari never carries a standalone PWA's motion-permission grant across app launches, and
	// there's no way to check permission status without another gesture-triggered prompt — see
	// $lib/shake.ts's `shakeNeedsRepromptThisSession`. So a returning user whose stored preference
	// is "on" from a past session gets this instead of a silently-dead listener.
	let visible = $state(false);

	onMount(() => {
		visible = shakeNeedsRepromptThisSession();
	});

	async function handleEnable() {
		const granted = await requestShakePermission();
		if (granted) startShakeListening(() => void runUndo());
		visible = false;
	}
</script>

{#if visible}
	<div
		role="status"
		class="fixed inset-x-4 z-30 mx-auto flex app-max-w items-center justify-between gap-3 rounded-b-xl border border-t-0 border-primary-300 bg-primary-50 px-4 py-2 text-sm shadow-sm dark:border-primary-700 dark:bg-primary-900/30 print:hidden"
		style="top: env(safe-area-inset-top);"
	>
		<span class="text-primary-900 dark:text-primary-200">Re-enable shake to undo?</span>
		<div class="flex shrink-0 items-center gap-3">
			<button
				type="button"
				class="font-semibold text-primary-900 underline hover:no-underline dark:text-primary-200"
				onclick={handleEnable}
			>
				Enable
			</button>
			<button
				type="button"
				aria-label="Dismiss"
				class="text-primary-900 dark:text-primary-200"
				onclick={() => (visible = false)}
			>
				<Icon name="close" class="h-4 w-4" />
			</button>
		</div>
	</div>
{/if}
