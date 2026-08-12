<script lang="ts">
	import { onMount } from 'svelte';
	import type { MetaResponse } from '@everylist/shared';
	import { fetchMeta } from '$lib/api/meta';
	import { formatBuildDate } from '$lib/api/format-build-date';

	let meta = $state<MetaResponse | null>(null);
	let loadFailed = $state(false);

	onMount(async () => {
		try {
			meta = await fetchMeta();
		} catch {
			loadFailed = true;
		}
	});
</script>

<svelte:head>
	<title>Settings — EveryList</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<h1 class="text-2xl font-bold">Settings</h1>
	<p class="text-gray-600 dark:text-gray-300">More settings are coming soon.</p>

	<footer class="mt-8 text-sm text-gray-500 dark:text-gray-400">
		{#if meta}
			EveryList {meta.version} ({meta.commit}) · built {formatBuildDate(meta.builtAt)}
		{:else if loadFailed}
			EveryList — build info unavailable
		{:else}
			Loading build info…
		{/if}
	</footer>
</main>
