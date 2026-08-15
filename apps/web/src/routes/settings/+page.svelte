<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { MetaResponse } from '@everylist/shared';
	import { fetchMeta } from '$lib/api/meta';
	import { formatBuildDate } from '$lib/api/format-build-date';
	import { getThemePreference, setThemePreference, type ThemePreference } from '$lib/theme';
	import { getAccentPreference, setAccentPreference, type AccentPreference } from '$lib/accent';
	import { logout } from '$lib/api/auth';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	let meta = $state<MetaResponse | null>(null);
	let loadFailed = $state(false);
	let themePreference = $state<ThemePreference>('automatic');
	let accentPreference = $state<AccentPreference>('slate');

	const themeOptions: { value: ThemePreference; label: string }[] = [
		{ value: 'automatic', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	const accentOptions: { value: AccentPreference; label: string; swatch: string }[] = [
		{ value: 'slate', label: 'Slate', swatch: '#3e4c63' },
		{ value: 'ocean', label: 'Ocean', swatch: '#0ea5e9' },
		{ value: 'forest', label: 'Forest', swatch: '#22c55e' },
		{ value: 'berry', label: 'Berry', swatch: '#d946ef' },
		{ value: 'sunset', label: 'Sunset', swatch: '#f59e0b' }
	];

	function chooseTheme(preference: ThemePreference) {
		themePreference = preference;
		setThemePreference(preference);
	}

	function chooseAccent(preference: AccentPreference) {
		accentPreference = preference;
		setAccentPreference(preference);
	}

	async function handleLogout() {
		await logout();
		await goto(resolve('/login'));
	}

	onMount(async () => {
		themePreference = getThemePreference();
		accentPreference = getAccentPreference();
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
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Accent color</span>
			<div role="radiogroup" aria-label="Accent color" class="flex gap-2">
				{#each accentOptions as option (option.value)}
					<button
						type="button"
						role="radio"
						aria-checked={accentPreference === option.value}
						aria-label={option.label}
						title={option.label}
						onclick={() => chooseAccent(option.value)}
						style:background-color={option.swatch}
						class="h-6 w-6 rounded-full border-2 {accentPreference === option.value
							? 'border-gray-900 dark:border-white'
							: 'border-transparent'}"
					></button>
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
				EveryList <span>{meta.version}</span> (<span>{meta.commit}</span>) · built
				<span>{formatBuildDate(meta.builtAt)}</span>
			{:else if loadFailed}
				EveryList — build info unavailable
			{:else}
				Loading build info…
			{/if}
		</div>
		<InstallPrompt />
	</section>
</main>
