<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { DebugResponse } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchDebugInfo } from '$lib/api/debug';
	import { ApiError } from '$lib/api/client';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let debugInfo = $state<DebugResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function formatValue(value: string | number | boolean | null | undefined): string {
		if (value === null || value === undefined) return '(not set)';
		return String(value);
	}

	// Pre-formatted as full strings (rather than interpolating `{a} ({b})` directly in the
	// template) so the Runtime section can render through the same single-expression
	// key/value row as the App/Request/Env sections below. Takes `runtime` directly (rather
	// than reading the module-level `debugInfo` and null-checking it here) since every call
	// site already only renders once `debugInfo` is known non-null.
	function runtimeRows(runtime: DebugResponse['runtime']): [string, string][] {
		return [
			['nodeVersion', runtime.nodeVersion],
			['platform', `${runtime.platform} (${runtime.arch})`],
			['pid', String(runtime.pid)],
			['uptime', `${runtime.uptimeSeconds}s`],
			[
				'memory (rss / heap)',
				`${runtime.memoryUsageMb.rss}MB / ${runtime.memoryUsageMb.heapUsed}MB of ${runtime.memoryUsageMb.heapTotal}MB`
			]
		];
	}

	async function load() {
		loading = true;
		try {
			debugInfo = await fetchDebugInfo();
			error = null;
		} catch (err) {
			if (err instanceof ApiError && err.status === 403) {
				error = "This page is only available to the instance's primary account.";
			} else {
				error = err instanceof ApiError ? err.message : 'Failed to load debug info.';
			}
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
</script>

<main
	class="mx-auto flex max-w-2xl flex-col gap-6 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="Debug" backHref={resolve('/settings')} />

	{#if loading}
		<p class="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
	{#if !loading && debugInfo}
		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<h2
				class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
			>
				App
			</h2>
			{#each Object.entries(debugInfo.app) as [key, value] (key)}
				<div
					class="flex items-center justify-between gap-4 px-4 py-2 font-mono text-xs odd:bg-gray-50 dark:odd:bg-gray-800/50"
				>
					<span class="shrink-0 text-gray-500 dark:text-gray-400">{key}</span>
					<span class="truncate text-right">{formatValue(value)}</span>
				</div>
			{/each}
		</section>

		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<h2
				class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
			>
				Runtime
			</h2>
			{#each runtimeRows(debugInfo.runtime) as [key, value] (key)}
				<div
					class="flex items-center justify-between gap-4 px-4 py-2 font-mono text-xs odd:bg-gray-50 dark:odd:bg-gray-800/50"
				>
					<span class="shrink-0 text-gray-500 dark:text-gray-400">{key}</span>
					<span class="truncate text-right">{value}</span>
				</div>
			{/each}
		</section>

		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<h2
				class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
			>
				Request
			</h2>
			{#each Object.entries(debugInfo.request) as [key, value] (key)}
				<div
					class="flex items-center justify-between gap-4 px-4 py-2 font-mono text-xs odd:bg-gray-50 dark:odd:bg-gray-800/50"
				>
					<span class="shrink-0 text-gray-500 dark:text-gray-400">{key}</span>
					<span class="truncate text-right">{formatValue(value)}</span>
				</div>
			{/each}
			<p class="px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">
				The Host header this request actually arrived with — useful for spotting a reverse proxy
				that isn't forwarding the real hostname.
			</p>
		</section>

		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<h2
				class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
			>
				Environment
			</h2>
			{#each Object.entries(debugInfo.env) as [key, value] (key)}
				<div
					class="flex items-center justify-between gap-4 px-4 py-2 font-mono text-xs odd:bg-gray-50 dark:odd:bg-gray-800/50"
				>
					<span class="shrink-0 text-gray-500 dark:text-gray-400">{key}</span>
					<span class="truncate text-right">{formatValue(value)}</span>
				</div>
			{/each}
			<p class="px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">
				These are the values this running process actually resolved — not what a Docker/Unraid
				config claims to set. Secret values report only whether they're set.
			</p>
		</section>
	{/if}
</main>
