<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Label, Input } from 'flowbite-svelte';
	import type { HaLinkDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchHaLink, updateHaLink } from '$lib/api/ha-link';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Loader from '$lib/components/Loader.svelte';

	let link = $state<HaLinkDto | null>(null);
	let manualUsername = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);

	async function load() {
		loading = true;
		try {
			link = await fetchHaLink();
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load Home Assistant settings.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		void load();
	});

	async function setLink(haUsername: string | null) {
		saving = true;
		try {
			link = await updateHaLink({ haUsername });
			error = null;
			manualUsername = '';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update Home Assistant settings.';
		} finally {
			saving = false;
		}
	}

	// Only offer the one-click button while there's a detected identity that isn't already the
	// linked one — once linked, Settings just shows the linked value instead.
	const canLinkDetected = $derived(
		link?.detectedHaUsername != null && link.detectedHaUsername !== link?.linkedHaUsername
	);
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Home Assistant" backHref={resolve('/settings')} />

	<p class="text-sm text-gray-600 dark:text-gray-400">
		Link this account to a Home Assistant username to sign in here without a separate EveryList
		password — either automatically (while viewing EveryList through the Ingress panel logged into
		Home Assistant as that user) or by typing your Home Assistant username and password. This
		doesn't enforce Home Assistant's own two-factor authentication, if you have it enabled.
	</p>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	{#if loading}
		<Loader />
	{:else if link}
		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<div class="flex items-center justify-between px-4 py-3">
				<span class="text-sm font-medium">Linked account</span>
				<span class="text-sm text-gray-600 dark:text-gray-400">
					{link.linkedHaUsername ?? 'Not linked'}
				</span>
			</div>

			{#if canLinkDetected}
				<div
					class="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700"
				>
					<span class="text-sm">
						Home Assistant identifies you as <strong>{link.detectedHaDisplayName}</strong>
					</span>
					<Button
						type="button"
						size="xs"
						disabled={saving}
						onclick={() => void setLink(link!.detectedHaUsername)}
					>
						Link this account
					</Button>
				</div>
			{/if}

			{#if link.linkedHaUsername}
				<div
					class="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700"
				>
					<span class="text-sm">Sign in with a different EveryList password instead</span>
					<Button
						type="button"
						size="xs"
						color="red"
						outline
						disabled={saving}
						onclick={() => void setLink(null)}
					>
						Unlink
					</Button>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-2">
			<Label for="manual-ha-username" class="text-xs text-gray-500 dark:text-gray-400">
				Or link a specific Home Assistant username manually
			</Label>
			<div class="flex gap-2">
				<Input
					id="manual-ha-username"
					type="text"
					bind:value={manualUsername}
					placeholder="Home Assistant username"
				/>
				<Button
					type="button"
					disabled={saving || !manualUsername.trim()}
					onclick={() => void setLink(manualUsername.trim())}
				>
					Link
				</Button>
			</div>
		</section>
	{/if}
</main>
