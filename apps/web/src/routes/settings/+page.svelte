<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Input } from 'flowbite-svelte';
	import type { MetaResponse, UserDto } from '@everylist/shared';
	import { fetchMeta } from '$lib/api/meta';
	import { formatBuildDate } from '$lib/api/format-build-date';
	import { getThemePreference, setThemePreference, type ThemePreference } from '$lib/theme';
	import { getAccentPreference, setAccentPreference, type AccentPreference } from '$lib/accent';
	import {
		canLockOrientation,
		getOrientationPreference,
		setOrientationPreference,
		type OrientationPreference
	} from '$lib/orientation';
	import { fetchProfile, logout, updateProfile } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';
	import { resetApp } from '$lib/pwa/reset';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let meta = $state<MetaResponse | null>(null);
	let loadFailed = $state(false);
	let profile = $state<UserDto | null>(null);
	let profileError = $state<string | null>(null);
	// Snapshots the name at edit time so blur can skip saving when nothing
	// changed — mirrors the categories page's editStartNames pattern.
	let editStartName: string | null = null;
	let editingName = $state(false);
	let themePreference = $state<ThemePreference>('automatic');
	let accentPreference = $state<AccentPreference>('slate');
	let orientationPreference = $state<OrientationPreference>('automatic');
	let canLockOrientationNow = $state(false);

	const themeOptions: { value: ThemePreference; label: string }[] = [
		{ value: 'automatic', label: 'Automatic' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	const orientationOptions: { value: OrientationPreference; label: string }[] = [
		{ value: 'automatic', label: 'Auto' },
		{ value: 'portrait', label: 'Portrait' },
		{ value: 'landscape', label: 'Landscape' }
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

	function chooseOrientation(preference: OrientationPreference) {
		orientationPreference = preference;
		void setOrientationPreference(preference);
	}

	async function handleLogout() {
		await logout();
		await goto(resolve('/login'));
	}

	function handleStartEdit() {
		// Only wired up inside the `{#if profile}` block, so `profile` is
		// always set here — the `?.` exists solely to satisfy the type.
		/* v8 ignore next */
		editStartName = profile?.fullName ?? null;
		editingName = true;
	}

	async function handleNameBlur() {
		editingName = false;
		if (!profile || profile.fullName === editStartName) return;
		const fullName = profile.fullName?.trim() ? profile.fullName.trim() : null;
		try {
			profile = await updateProfile({ fullName });
			profileError = null;
		} catch (err) {
			profileError = err instanceof ApiError ? err.message : 'Failed to save name.';
			// Keep the input open so the unsaved edit isn't lost.
			editingName = true;
		}
	}

	let resetting = $state(false);

	async function handleResetApp() {
		resetting = true;
		await resetApp();
	}

	onMount(async () => {
		themePreference = getThemePreference();
		accentPreference = getAccentPreference();
		orientationPreference = getOrientationPreference();
		canLockOrientationNow = canLockOrientation();
		try {
			meta = await fetchMeta();
		} catch {
			loadFailed = true;
		}
		try {
			profile = await fetchProfile();
		} catch (err) {
			profileError = err instanceof ApiError ? err.message : 'Failed to load account.';
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
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Account
		</h2>
		{#if profileError}
			<p class="px-4 pt-3 text-sm text-red-600 dark:text-red-400">{profileError}</p>
		{/if}
		{#if profile}
			<div class="flex items-center justify-between px-4 py-3">
				<span class="text-sm font-medium">Email</span>
				<span class="text-sm text-gray-600 dark:text-gray-400">{profile.email}</span>
			</div>
			<div class="flex items-center justify-between gap-4 px-4 py-3">
				<span class="shrink-0 text-sm font-medium">Name</span>
				{#if editingName}
					<Input
						bind:value={
							() => profile?.fullName ?? '',
							(value) => {
								// Only wired up inside the `{#if profile}` block.
								/* v8 ignore next */
								if (profile) profile.fullName = value;
							}
						}
						placeholder="Add your name"
						autofocus
						onblur={handleNameBlur}
					/>
				{:else}
					<div class="flex items-center gap-2">
						<span
							class="text-sm {profile.fullName
								? 'text-gray-600 dark:text-gray-400'
								: 'text-gray-400 dark:text-gray-500'}"
						>
							{profile.fullName || 'Add your name'}
						</span>
						<button
							type="button"
							aria-label="Edit name"
							onclick={handleStartEdit}
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-primary-400"
						>
							<Icon name="pencil" class="h-4 w-4" />
						</button>
					</div>
				{/if}
			</div>
		{/if}
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Signed in</span>
			<button
				type="button"
				onclick={handleLogout}
				class="text-sm text-gray-600 hover:underline dark:text-gray-400"
			>
				Log out
			</button>
		</div>
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
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
		<div class="flex items-center justify-between px-4 py-3">
			<span class="text-sm font-medium">Screen Orientation</span>
			<div
				role="radiogroup"
				aria-label="Screen orientation"
				class="flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
			>
				{#each orientationOptions as option (option.value)}
					<button
						type="button"
						role="radio"
						aria-checked={orientationPreference === option.value}
						onclick={() => chooseOrientation(option.value)}
						class="border-l border-gray-200 px-3 py-1.5 text-sm font-medium first:border-l-0 dark:border-gray-700 {orientationPreference ===
						option.value
							? 'bg-primary-600 text-white'
							: 'bg-transparent text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}"
					>
						{option.label}
					</button>
				{/each}
			</div>
		</div>
		{#if !canLockOrientationNow}
			<p class="px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">
				Install EveryList to your home screen to lock orientation — it only takes effect once
				running as an installed app.
			</p>
		{/if}
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
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

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Troubleshooting
		</h2>
		<div class="flex items-center justify-between gap-4 px-4 py-3">
			<span class="text-sm text-gray-600 dark:text-gray-300">
				If the app looks broken or stuck after an update, this clears cached app data and reloads —
				the on-device fix for a home-screen install with no devtools access.
			</span>
			<button
				type="button"
				onclick={handleResetApp}
				disabled={resetting}
				class="shrink-0 text-sm text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
			>
				{resetting ? 'Resetting…' : 'Reset app'}
			</button>
		</div>
	</section>
</main>
