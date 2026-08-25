<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import type { QueuedMutation } from '$lib/offline/db';
	import { failedMutations, pendingMutations, queueCounts } from '$lib/offline/sync-queue';
	import { flushQueue } from '$lib/offline/flush';
	import { connectivity } from '$lib/offline/connectivity.svelte';
	import { refreshApp } from '$lib/reload';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';

	const POLL_INTERVAL_MS = 3000;

	let counts = $state({ pending: 0, failed: 0, conflict: 0 });
	let pending = $state<QueuedMutation[]>([]);
	let failed = $state<QueuedMutation[]>([]);
	let retrying = $state(false);
	let refreshing = $state(false);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function refresh() {
		[counts, pending, failed] = await Promise.all([
			queueCounts(),
			pendingMutations(),
			failedMutations()
		]);
	}

	async function retryNow() {
		retrying = true;
		try {
			await flushQueue();
		} catch {
			// flushQueue records per-mutation failures in the queue itself; the
			// refreshed counts below reflect whatever is still pending/failed.
		} finally {
			retrying = false;
			await refresh();
		}
	}

	function refreshNow() {
		refreshing = true;
		refreshApp();
	}

	onMount(() => {
		void refresh();
		pollInterval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
	});

	onDestroy(() => {
		// pollInterval is always set by onMount before onDestroy can run.
		clearInterval(pollInterval!);
	});

	const entityLabel: Record<QueuedMutation['entityType'], string> = {
		item: 'item',
		category: 'category',
		store: 'store',
		favorite_item: 'favorite item',
		list: 'list',
		store_category_order: 'store category order'
	};

	const verbByOp: Record<QueuedMutation['op'], string> = {
		create: 'Create',
		update: 'Update',
		delete: 'Delete',
		reorder: 'Reorder',
		attach: 'Attach',
		restore: 'Restore',
		reset: 'Reset'
	};

	function describeMutation(mutation: QueuedMutation): string {
		const name = typeof mutation.payload?.name === 'string' ? ` "${mutation.payload.name}"` : '';
		return `${verbByOp[mutation.op]} ${entityLabel[mutation.entityType]}${name}`;
	}

	const total = $derived(counts.pending + counts.failed + counts.conflict);
	const lastSyncText = $derived(
		connectivity.lastSuccessfulSyncAt === null
			? 'Never'
			: new Date(connectivity.lastSuccessfulSyncAt).toLocaleString()
	);
</script>

<main
	class="mx-auto flex max-w-lg flex-col gap-6 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Sync Status" backHref={resolve('/settings')} backLabel="Settings" />

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			<span>Connection</span>
			<Button type="button" size="xs" disabled={refreshing} onclick={refreshNow}>
				{refreshing ? 'Refreshing…' : 'Refresh now'}
			</Button>
		</h2>
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Server</span>
			{#if connectivity.serverUnavailable}
				<span class="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
					<Icon name="cloudOffOutline" class="h-4 w-4" />
					Unavailable
				</span>
			{:else}
				<span class="flex items-center gap-2 text-sm text-signal">
					<Icon name="cloudCheckOutline" class="h-4 w-4" />
					Connected
				</span>
			{/if}
		</div>
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Last successful sync</span>
			<span class="text-sm text-gray-600 dark:text-gray-400">{lastSyncText}</span>
		</div>
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			<span>Queued changes</span>
			{#if total > 0}
				<Button type="button" size="xs" disabled={retrying} onclick={retryNow}>
					{retrying ? 'Retrying…' : 'Retry now'}
				</Button>
			{/if}
		</h2>

		{#if total === 0}
			<p class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
				Everything is synced. Changes made offline are queued here until the server is reachable
				again.
			</p>
		{:else}
			<ul class="divide-y divide-gray-200 dark:divide-gray-700">
				{#each [...pending, ...failed] as mutation (mutation.id)}
					<li class="flex flex-col gap-1 px-4 py-3">
						<div class="flex items-center justify-between gap-2">
							<span class="text-sm">{describeMutation(mutation)}</span>
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-xs {mutation.status === 'failed'
									? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
									: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
							>
								{mutation.status === 'failed' ? 'Failed' : 'Pending'}
							</span>
						</div>
						{#if mutation.lastError}
							<p class="text-xs text-red-600 dark:text-red-400">
								{`${mutation.lastError}${mutation.attempts > 0 ? ` (${mutation.attempts} attempt${mutation.attempts === 1 ? '' : 's'})` : ''}`}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
