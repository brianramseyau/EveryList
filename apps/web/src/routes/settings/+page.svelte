<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { MetaResponse } from '@everylist/shared';
	import { fetchMeta } from '$lib/api/meta';
	import { formatBuildDate } from '$lib/api/format-build-date';
	import { getThemePreference, setThemePreference, type ThemePreference } from '$lib/theme';
	import { logout } from '$lib/api/auth';
	import PageHeader from '$lib/components/PageHeader.svelte';

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

	async function handleLogout() {
		await logout();
		await goto(resolve('/login'));
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
	<PageHeader title="Settings" />

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Account
		</h2>
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Signed in</span>
			<button
				type="button"
				onclick={handleLogout}
				class="text-sm text-gray-500 hover:underline dark:text-gray-400"
			>
				Log out
			</button>
		</div>
	</section>

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

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			About
		</h2>
		<div class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
			{#if meta}
				EveryList {meta.version} ({meta.commit}) · built {formatBuildDate(meta.builtAt)}
			{:else if loadFailed}
				EveryList — build info unavailable
			{:else}
				Loading build info…
			{/if}
		</div>
	</section>
</main>
