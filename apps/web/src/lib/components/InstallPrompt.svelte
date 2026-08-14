<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button } from 'flowbite-svelte';
	import {
		hasDeferredInstallPrompt,
		isIOSSafari,
		isStandalone,
		onInstallAvailabilityChange,
		promptInstall
	} from '$lib/pwa/install-prompt';

	let standalone = $state(true);
	let available = $state(false);
	let iosSafari = $state(false);
	let installing = $state(false);

	onMount(() => {
		standalone = isStandalone();
		available = hasDeferredInstallPrompt();
		iosSafari = isIOSSafari();
		onInstallAvailabilityChange((next) => {
			available = next;
		});
	});

	onDestroy(() => {
		onInstallAvailabilityChange(null);
	});

	async function handleInstall() {
		installing = true;
		try {
			await promptInstall();
		} finally {
			installing = false;
			available = hasDeferredInstallPrompt();
		}
	}
</script>

{#if !standalone}
	{#if available}
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Install EveryList</span>
			<Button type="button" size="xs" disabled={installing} onclick={handleInstall}>
				{installing ? 'Installing…' : 'Install'}
			</Button>
		</div>
	{:else if iosSafari}
		<p class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
			Tap <span class="font-medium">Share</span>, then
			<span class="font-medium">Add to Home Screen</span>, to install EveryList.
		</p>
	{/if}
{/if}
