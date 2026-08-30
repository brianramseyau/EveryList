<script lang="ts">
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { App } from '@capacitor/app';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Input } from 'flowbite-svelte';
	import type { MetaResponse, UserDto } from '@everylist/shared';
	import { fetchMeta } from '$lib/api/meta';
	import { formatBuildDate } from '$lib/api/format-build-date';
	import { clearToken } from '$lib/api/token';
	import { clearServerUrl, getServerUrl } from '$lib/api/server-url';
	import { getThemePreference, setThemePreference, type ThemePreference } from '$lib/theme';
	import { getAccentPreference, setAccentPreference, type AccentPreference } from '$lib/accent';
	import {
		canLockOrientation,
		getOrientationPreference,
		setOrientationPreference,
		supportsScreenOrientationLock,
		type OrientationPreference
	} from '$lib/orientation';
	import {
		getShakeToUndoPreference,
		requestShakePermission,
		setShakeToUndoPreference,
		startShakeListening,
		stopShakeListening
	} from '$lib/shake';
	import { runUndo } from '$lib/undo';
	import { fetchProfile, logout, updateProfile } from '$lib/api/auth';
	import { ApiError } from '$lib/api/client';
	import { resetApp } from '$lib/pwa/reset';
	import { checkForUpdate } from '$lib/pwa/update';
	import { connectivity } from '$lib/offline/connectivity.svelte';
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
	let supportsOrientationLock = $state(false);
	let isNative = $state(false);
	let isAndroid = $state(false);
	let orientationFeedback = $state<string | null>(null);
	let shakeToUndoEnabled = $state(true);
	let shakeFeedback = $state<string | null>(null);
	let serverUrl = $state('');
	let nativeInfo = $state<{ version: string; build: string } | null>(null);

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

	async function chooseOrientation(preference: OrientationPreference) {
		orientationPreference = preference;
		orientationFeedback = null;
		// Not standalone, not native → the static install/unsupported hint below
		// already explains why the lock can't take. Don't double up.
		if (!canLockOrientationNow && !isNative) return;
		const result = await setOrientationPreference(preference);
		if (result.status !== 'failed') return;
		// lock() is a silently-rejecting API on several platforms (Chrome
		// Android rejects when the device's Auto-rotate is off, and on many
		// builds even in an installed PWA). Say what actually happened instead
		// of letting the control look broken — see the AGENTS.md postmortem.
		if (result.reason === 'no-api') {
			orientationFeedback =
				"Screen orientation lock isn't supported in this browser — it only works in the native app.";
		} else {
			// 'rejected' — the only other failure reachable past the standalone
			// gate above (a not-standalone result would have been returned
			// before this, when canLockOrientationNow was false).
			orientationFeedback = isNative
				? "This device didn't allow locking the screen orientation."
				: "Your device's screen rotation (Auto-rotate) may be off — turn it on in your system settings, then rotate your phone once. For a guaranteed lock, use the native app.";
		}
	}

	/** Toggling on has to (re-)request iOS Safari's motion permission from this very click — it's a
	 * user gesture, the only context that API will actually prompt in (see
	 * PLAN_21_PHASE_SHAKE_TO_UNDO.md); native and Android never need it, so `requestShakePermission`
	 * resolves `true` immediately there. Toggling off just stops the shared listener started by
	 * `+layout.svelte`'s `initShakeToUndo` (or by a previous call here) — there's nothing else to
	 * revoke. */
	async function chooseShakeToUndo(enabled: boolean) {
		shakeFeedback = null;
		if (enabled) {
			const granted = await requestShakePermission();
			if (!granted) {
				shakeFeedback =
					"This browser didn't allow motion access, which shake to undo needs to detect a shake.";
				return;
			}
			startShakeListening(() => void runUndo());
		} else {
			stopShakeListening();
		}
		shakeToUndoEnabled = enabled;
		setShakeToUndoPreference(enabled);
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
	let confirmingReset = $state(false);

	async function handleResetApp() {
		resetting = true;
		await resetApp();
	}

	let updateStatus = $state<'idle' | 'checking' | 'updating' | 'up-to-date' | 'unavailable'>(
		'idle'
	);

	async function handleCheckForUpdate() {
		updateStatus = 'checking';
		const result = await checkForUpdate();
		// 'updating' means a new service worker was found — it activates and reloads the page on
		// its own (see +layout.svelte's onNeedReload); the banner reports that a refresh is
		// imminent instead of leaving the click with nothing to show.
		updateStatus = result;
	}

	/** Changing servers invalidates the current session (a token from one server means nothing to
	 * another), so this clears both and sends the user back through /server-setup — mirrors
	 * handleLogout's directness, no confirmation step. */
	async function handleChangeServer() {
		clearToken();
		clearServerUrl();
		await goto(resolve('/server-setup'));
	}

	onMount(async () => {
		themePreference = getThemePreference();
		accentPreference = getAccentPreference();
		orientationPreference = getOrientationPreference();
		shakeToUndoEnabled = getShakeToUndoPreference();
		canLockOrientationNow = canLockOrientation();
		supportsOrientationLock = supportsScreenOrientationLock();
		isNative = Capacitor.isNativePlatform();
		isAndroid = isNative && Capacitor.getPlatform() === 'android';
		serverUrl = getServerUrl();
		if (isNative) {
			try {
				const info = await App.getInfo();
				nativeInfo = { version: info.version, build: info.build };
			} catch {
				nativeInfo = null;
			}
		}
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

<main
	class="mx-auto flex app-max-w flex-col gap-6 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
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
				{#if supportsOrientationLock}
					Install EveryList to your home screen to lock orientation — it only takes effect once
					running as an installed app.
				{:else}
					Screen orientation lock isn't supported in this browser — it only works in the native app.
				{/if}
			</p>
		{/if}
		{#if orientationFeedback}
			<p class="px-4 pb-3 text-xs text-amber-600 dark:text-amber-400">{orientationFeedback}</p>
		{/if}
		<div
			class="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700"
		>
			<span class="text-sm font-medium">Shake to undo</span>
			<div
				role="radiogroup"
				aria-label="Shake to undo"
				class="flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
			>
				<button
					type="button"
					role="radio"
					aria-checked={shakeToUndoEnabled}
					onclick={() => chooseShakeToUndo(true)}
					class="border-l border-gray-200 px-3 py-1.5 text-sm font-medium first:border-l-0 dark:border-gray-700 {shakeToUndoEnabled
						? 'bg-primary-600 text-white'
						: 'bg-transparent text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}"
				>
					On
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={!shakeToUndoEnabled}
					onclick={() => chooseShakeToUndo(false)}
					class="border-l border-gray-200 px-3 py-1.5 text-sm font-medium first:border-l-0 dark:border-gray-700 {!shakeToUndoEnabled
						? 'bg-primary-600 text-white'
						: 'bg-transparent text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}"
				>
					Off
				</button>
			</div>
		</div>
		{#if shakeFeedback}
			<p class="px-4 pb-3 text-xs text-amber-600 dark:text-amber-400">{shakeFeedback}</p>
		{/if}
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			About
		</h2>
		<div class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
			{#if isNative && nativeInfo}
				<div>
					App <span>{nativeInfo.version}</span> (<span>{nativeInfo.build}</span>)
				</div>
			{/if}
			{#if meta}
				<div>
					Server <span>{meta.version}</span> (<span>{meta.commit}</span>) · built
					<span>{formatBuildDate(meta.builtAt)}</span>
				</div>
			{:else if loadFailed}
				EveryList — build info unavailable
			{:else}
				Loading build info…
			{/if}
		</div>
		<InstallPrompt />
	</section>

	{#if isNative}
		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<h2
				class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
			>
				Server
			</h2>
			<div class="flex items-center justify-between gap-4 px-4 py-3">
				<span class="truncate text-sm text-gray-600 dark:text-gray-400">{serverUrl}</span>
				<button
					type="button"
					onclick={handleChangeServer}
					class="shrink-0 text-sm text-gray-600 hover:underline dark:text-gray-400"
				>
					Change
				</button>
			</div>
		</section>
	{/if}

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Sync
		</h2>
		<a
			href={resolve('/settings/sync')}
			class="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
		>
			<span>Sync status</span>
			{#if connectivity.serverUnavailable}
				<span class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
					<Icon name="cloudOffOutline" class="h-4 w-4" />
					Server unavailable
				</span>
			{:else}
				<Icon name="chevronRight" class="h-5 w-5 text-gray-400" />
			{/if}
		</a>
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Backups
		</h2>
		<a
			href={resolve('/settings/backups')}
			class="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
		>
			<span>Automated backups</span>
			<Icon name="chevronRight" class="h-5 w-5 text-gray-400" />
		</a>
	</section>

	<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
		<h2
			class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
		>
			Integrations
		</h2>
		<a
			href={resolve('/settings/tokens')}
			class="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
		>
			<span>Access Tokens</span>
			<Icon name="chevronRight" class="h-5 w-5 text-gray-400" />
		</a>
		<a
			href={resolve('/settings/alexa')}
			class="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
		>
			<span>Alexa</span>
			<Icon name="chevronRight" class="h-5 w-5 text-gray-400" />
		</a>
		{#if isAndroid}
			<a
				href={resolve('/settings/widget')}
				class="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
			>
				<span>Home-screen widget</span>
				<Icon name="chevronRight" class="h-5 w-5 text-gray-400" />
			</a>
		{/if}
	</section>

	{#if !isNative}
		<section class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
			<h2
				class="border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-600 uppercase dark:border-gray-700 dark:text-gray-400"
			>
				Troubleshooting
			</h2>
			<div class="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
				{#if updateStatus === 'up-to-date'}
					<p
						class="mb-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
					>
						You're on the latest version.
					</p>
				{:else if updateStatus === 'unavailable'}
					<p
						class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
					>
						Update check unavailable right now — try again in a moment.
					</p>
				{:else if updateStatus === 'updating'}
					<p
						class="mb-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
					>
						An update is ready — it will apply when the app refreshes.
					</p>
				{/if}
				<div class="flex items-center justify-between gap-4">
					<span class="text-sm text-gray-600 dark:text-gray-300">
						Check for a newer version of the app right now, instead of waiting for it to update on
						its own.
					</span>
					<button
						type="button"
						onclick={handleCheckForUpdate}
						disabled={updateStatus === 'checking'}
						class="w-28 shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{updateStatus === 'checking' ? 'Updating...' : 'Update'}
					</button>
				</div>
			</div>
			{#if confirmingReset}
				<div
					class="flex items-center justify-between gap-2 rounded-lg border border-red-200 px-4 py-3 text-sm dark:border-red-900"
				>
					<p class="text-red-600 dark:text-red-400">
						This clears cached app data and reloads the app. Continue?
					</p>
					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							onclick={handleResetApp}
							disabled={resetting}
							class="w-28 rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
						>
							Reset
						</button>
						<button
							type="button"
							onclick={() => (confirmingReset = false)}
							disabled={resetting}
							class="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-4 px-4 py-3">
					<span class="text-sm text-gray-600 dark:text-gray-300">
						If the app looks broken or stuck after an update, this clears cached app data and
						reloads — the on-device fix for a home-screen install with no devtools access.
					</span>
					<button
						type="button"
						onclick={() => (confirmingReset = true)}
						class="w-28 shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
					>
						Reset
					</button>
				</div>
			{/if}
			{#if profile?.id === 1}
				<a
					href={resolve('/debug')}
					class="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
				>
					<span>Debug info</span>
					<Icon name="chevronRight" class="h-5 w-5 text-gray-400" />
				</a>
			{/if}
		</section>
	{/if}
</main>
