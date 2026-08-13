<script lang="ts">
	import { onMount } from 'svelte';
	import type { MetaResponse } from '@everylist/shared';
	import { fetchMeta } from '$lib/api/meta';
	import { formatBuildDate } from '$lib/api/format-build-date';
	import { getThemePreference, setThemePreference, type ThemePreference } from '$lib/theme';

	let meta = $state<MetaResponse | null>(null);
	let loadFailed = $state(false);
	let themePreference = $state<ThemePreference>('automatic');

	const themeOptions: { value: ThemePreference; label: string }[] = [
		{ value: 'automatic', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	function chooseTheme(preference: ThemePreference) {
		themePreference = preference;
		setThemePreference(preference);
	}

	onMount(async () => {
		themePreference = getThemePreference();
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

<main class="mx-auto flex max-w-lg flex-col gap-6 p-8">
	<h1 class="text-2xl font-bold">Settings</h1>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Appearance
		</h2>
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">App Theme</span>
			<div
				role="radiogroup"
				aria-label="App theme"
				class="flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
			>
				{#each themeOptions as option (option.value)}
					<button
						type="button"
						role="radio"
						aria-checked={themePreference === option.value}
						onclick={() => chooseTheme(option.value)}
						class="border-l border-gray-200 px-3 py-1.5 text-sm font-medium first:border-l-0 dark:border-gray-700 {themePreference ===
						option.value
							? 'bg-primary-600 text-white'
							: 'bg-transparent text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}"
					>
						{option.label}
					</button>
				{/each}
			</div>
		</div>
	</section>

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
