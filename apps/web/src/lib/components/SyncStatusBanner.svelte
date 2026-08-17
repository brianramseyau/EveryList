<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button } from 'flowbite-svelte';
	import { queueCounts, type QueueCounts } from '$lib/offline/sync-queue';
	import { flushQueue, onConflict } from '$lib/offline/flush';

	const POLL_INTERVAL_MS = 3000;
	const CONFLICT_MESSAGE_MS = 6000;

	let counts = $state<QueueCounts>({ pending: 0, failed: 0, conflict: 0 });
	let retrying = $state(false);
	let conflictMessage = $state<string | null>(null);

	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let conflictTimeout: ReturnType<typeof setTimeout> | null = null;
	let unsubscribeConflict: (() => void) | null = null;

	async function refresh() {
		counts = await queueCounts();
	}

	async function retryNow() {
		retrying = true;
		try {
			await flushQueue();
		} catch {
			// flushQueue already records per-mutation failures in the queue itself
			// (see offline/flush.ts) — nothing extra to do here but let the
			// refreshed counts reflect what's still pending/failed below.
		} finally {
			retrying = false;
			await refresh();
		}
	}

	onMount(() => {
		void refresh();
		pollInterval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
		unsubscribeConflict = onConflict(() => {
			conflictMessage = 'Some changes were reconciled with a newer edit.';
			if (conflictTimeout) clearTimeout(conflictTimeout);
			conflictTimeout = setTimeout(() => {
				conflictMessage = null;
			}, CONFLICT_MESSAGE_MS);
		});
	});

	onDestroy(() => {
		// pollInterval is always set by onMount before onDestroy can run.
		clearInterval(pollInterval!);
		if (conflictTimeout) clearTimeout(conflictTimeout);
		unsubscribeConflict?.();
	});

	const total = $derived(counts.pending + counts.failed + counts.conflict);
	const label = $derived(
		counts.failed > 0
			? `${total} changes waiting to sync — ${counts.failed} failed`
			: `${total} change${total === 1 ? '' : 's'} syncing…`
	);
</script>

{#if total > 0}
	<div
		role="status"
		class="fixed inset-x-4 bottom-20 z-20 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
	>
		<span class="text-sm">{label}</span>
		<Button type="button" size="xs" disabled={retrying} onclick={retryNow}>
			{retrying ? 'Retrying…' : 'Retry now'}
		</Button>
	</div>
{/if}

{#if conflictMessage}
	<div
		role="status"
		class="fixed inset-x-4 bottom-36 z-20 mx-auto max-w-sm rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
	>
		{conflictMessage}
	</div>
{/if}
