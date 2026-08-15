<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { getToken } from '$lib/api/token';
	import { initTheme } from '$lib/theme';
	import { initAccent } from '$lib/accent';
	import { initOrientation } from '$lib/orientation';
	import { startFlushLoop } from '$lib/offline/flush';
	import { initInstallPrompt } from '$lib/pwa/install-prompt';
	import { clearBadge, refreshBadgeCount } from '$lib/pwa/badge';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';

	let { children } = $props();

	let loggedIn = $state(false);

	function refreshAuth() {
		loggedIn = Boolean(getToken());
	}

	function syncBadge() {
		if (loggedIn) void refreshBadgeCount();
		else clearBadge();
	}

	onMount(() => {
		initTheme();
		initAccent();
		void initOrientation();
		refreshAuth();
		syncBadge();
		startFlushLoop();
		initInstallPrompt();
		// vite-plugin-pwa's virtual module only exists in a built/dev-served app, never under
		// Vitest — dynamic-imported so test runs never need to resolve it.
		void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
	});
	afterNavigate(() => {
		refreshAuth();
		syncBadge();
	});

	const navSections = ['/lists', '/settings'];
	const showNav = $derived(
		loggedIn && navSections.some((section) => page.url.pathname.startsWith(section))
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-paper text-ink">
	<div class={showNav ? 'pb-16' : ''}>
		{@render children()}
	</div>
	{#if showNav}
		<div class="print:hidden">
			<BottomNav />
		</div>
	{/if}
	{#if loggedIn}
		<div class="print:hidden">
			<SyncStatusBanner />
		</div>
	{/if}
</div>
