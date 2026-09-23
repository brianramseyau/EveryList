<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Label, Input, Helper } from 'flowbite-svelte';
	import { fetchPing } from '$lib/api/ping';
	import { getServerUrl, setServerUrl } from '$lib/api/server-url';
	import { isDesktop } from '$lib/platform/desktop';

	// Pre-filled with whatever's already configured, so this screen doubles as the "change server"
	// entry point (Settings routes back here) as well as first-run setup.
	let url = $state(getServerUrl());
	let error = $state<string | null>(null);
	let unreachable = $state(false);
	let checking = $state(false);
	let enablingStandalone = $state(false);
	let standaloneError = $state<string | null>(null);
	let lastCandidate: string | null = null;

	// Standalone mode (PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md) is offered only on first run, not
	// when this screen is reopened to change an already-configured server — "one-time choice at
	// first launch", and switching an existing remote-mode install into standalone isn't supported.
	const offerStandalone = isDesktop() && !getServerUrl();

	async function useStandalone() {
		enablingStandalone = true;
		standaloneError = null;
		try {
			// Resolves once the window has navigated to the embedded server's own origin — this
			// component is torn down by that navigation, so there's nothing further to do here on
			// success.
			await window.everylistDesktop?.enableStandalone();
		} catch {
			// The embedded server failed to start or become healthy — leave this screen in place
			// with the button re-enabled to try again rather than stranding the user on a blank page.
			standaloneError =
				"Couldn't start the local server. Try again, or connect to a server instead.";
		} finally {
			enablingStandalone = false;
		}
	}

	/** Must be an absolute http(s) URL — anything else (a bare host, a typo, `capacitor://...`)
	 * can't be a real server address. */
	function normalize(input: string): string | null {
		const trimmed = input.trim();
		try {
			const parsed = new URL(trimmed);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
			return trimmed;
		} catch {
			return null;
		}
	}

	async function save(candidate: string) {
		setServerUrl(candidate);
		await goto(resolve('/login'));
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		unreachable = false;

		const candidate = normalize(url);
		if (!candidate) {
			error = 'Enter a valid server URL, e.g. https://everylist.example.com';
			return;
		}

		lastCandidate = candidate;
		checking = true;
		try {
			const reachable = await fetchPing(candidate);
			if (reachable) await save(candidate);
			else unreachable = true;
		} finally {
			checking = false;
		}
	}

	async function continueAnyway() {
		// Only reachable once `unreachable` is true, which handleSubmit only ever sets right after
		// assigning `lastCandidate` in the same call — never actually null here.
		/* v8 ignore next */
		if (!lastCandidate) return;
		await save(lastCandidate);
	}
</script>

<svelte:head>
	<title>Server — EveryList</title>
</svelte:head>

<main
	class="mx-auto flex max-w-sm flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<h1 class="text-2xl font-bold">Connect to your server</h1>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		Enter the address of your self-hosted EveryList server.
	</p>

	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div>
			<Label for="server-url" class="mb-2">Server URL</Label>
			<Input
				id="server-url"
				type="text"
				bind:value={url}
				placeholder="https://everylist.example.com"
				required
				autocomplete="url"
			/>
		</div>

		{#if error}
			<Helper class="text-red-600 dark:text-red-400">{error}</Helper>
		{/if}

		{#if unreachable}
			<div class="flex flex-col gap-2">
				<Helper class="text-amber-600 dark:text-amber-400">
					Couldn't reach this server. Check the URL, or continue anyway if you know it's correct.
				</Helper>
				<Button type="button" color="alternative" onclick={continueAnyway}>Continue anyway</Button>
			</div>
		{/if}

		<Button type="submit" disabled={checking}>{checking ? 'Checking…' : 'Continue'}</Button>
	</form>

	{#if offerStandalone}
		<div class="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
			<p class="text-sm text-gray-600 dark:text-gray-300">
				No server? EveryList can run entirely on this device instead — your data stays local, with
				no account to share and nothing else on the network able to reach it.
			</p>
			{#if standaloneError}
				<Helper class="text-red-600 dark:text-red-400">{standaloneError}</Helper>
			{/if}
			<Button
				type="button"
				color="alternative"
				onclick={useStandalone}
				disabled={enablingStandalone}
			>
				{enablingStandalone ? 'Starting…' : 'Use EveryList on this device only'}
			</Button>
		</div>
	{/if}
</main>
