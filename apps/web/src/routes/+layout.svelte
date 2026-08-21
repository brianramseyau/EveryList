<script lang="ts">
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { afterNavigate, goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { getToken } from '$lib/api/token';
	import { getServerUrl } from '$lib/api/server-url';
	import { initTheme } from '$lib/theme';
	import { initAccent } from '$lib/accent';
	import { initOrientation } from '$lib/orientation';
	import { disablePinchZoom } from '$lib/pinch-zoom';
	import { consumeNavDirection, consumeSkipTransition } from '$lib/nav-direction';
	import { startFlushLoop } from '$lib/offline/flush';
	import { startConnectivityMonitor } from '$lib/offline/connectivity.svelte';
	import { initInstallPrompt } from '$lib/pwa/install-prompt';
	import { clearBadge, refreshBadgeCount } from '$lib/pwa/badge';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import SyncStatusIcon from '$lib/components/SyncStatusIcon.svelte';

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
		// Native builds have no baked-in server address (PHASE13_PLAN.md §1) — gate here rather
		// than on /login itself, since a fresh native install also has no token, and every other
		// API call (including login) needs somewhere real to point before it can work at all.
		const serverSetupPath = resolve('/server-setup');
		if (Capacitor.isNativePlatform() && !getServerUrl() && page.url.pathname !== serverSetupPath) {
			void goto(serverSetupPath);
		}
		initTheme();
		initAccent();
		void initOrientation();
		disablePinchZoom();
		refreshAuth();
		syncBadge();
		startFlushLoop();
		startConnectivityMonitor();
		initInstallPrompt();
		// vite-plugin-pwa's virtual module only exists in a built/dev-served app, never under
		// Vitest — dynamic-imported so test runs never need to resolve it.
		void import('virtual:pwa-register').then(({ registerSW }) =>
			registerSW({
				immediate: true,
				// Without this, autoUpdate's default reload fires the instant the new SW
				// activates — which can land mid-hydration on a cold PWA launch right after
				// a deploy (skipWaiting/clientsClaim let the new SW claim the page before its
				// first load finishes), interrupting that load and leaving the app stuck on
				// the OS splash screen. Deferring until the page's own load has settled keeps
				// the reload from racing the app's first paint.
				onNeedReload() {
					const reload = () => window.location.reload();
					if (document.readyState === 'complete') reload();
					else window.addEventListener('load', reload, { once: true });
				}
			})
		);
	});
	afterNavigate(() => {
		refreshAuth();
		syncBadge();
	});

	// Native page-transition slide, gated on browser support (PHASE9_PLAN.md
	// #11) — a no-op on Safari/iOS, which never defines startViewTransition.
	// Direction comes from `navigation.delta`, only present on browser
	// back/forward (popstate) — everything else (link clicks, goto()) reads
	// as "forward".
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (consumeSkipTransition()) return;
		const isPopstateBack = navigation.type === 'popstate' && (navigation.delta ?? 0) < 0;
		document.documentElement.dataset.navDirection = consumeNavDirection(isPopstateBack);

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
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
			<SyncStatusIcon />
		</div>
	{/if}
</div>
