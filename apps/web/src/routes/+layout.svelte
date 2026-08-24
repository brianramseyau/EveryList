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
	import { startBackgroundSync } from '$lib/offline/background-sync';
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
		startBackgroundSync();
		initInstallPrompt();
		// The Workbox service worker is meaningful for the browser/PWA build (offline caching,
		// update prompts) but Capacitor's WebView already loads the bundle from local files —
		// there's no real network layer for it to usefully intercept there, and registering one
		// against a `capacitor://`/local `https://` origin is unsupported/unreliable in practice
		// (PHASE13_PLAN.md §3). Skip it entirely on native rather than relying on it merely
		// no-oping harmlessly.
		if (!Capacitor.isNativePlatform()) {
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
		}
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
	<!-- Belt-and-suspenders opaque fill for the status-bar/notch strip itself (see
	     layout.css's overscroll-behavior-y comment for why that area can otherwise
	     show scrolled content through it on iOS) — sits above every other
	     fixed/sticky layer (BottomNav, SyncStatusIcon, list header, both z-20) so
	     it always wins regardless of what's scrolled underneath.

	     overscroll-behavior-y alone wasn't enough: WebKit paints `position: fixed`
	     elements on the main thread but scrolls content on the compositor thread,
	     so during an ordinary (non-bounce) momentum scroll/fling — not just at the
	     top edge — this strip can lag a frame or two behind the content racing
	     past underneath it, letting a list item flash through the notch exactly
	     like the sticky list header did before it stuck. `translateZ(0)` forces
	     both onto their own compositor layer up front instead of promoting (and
	     re-rastering) them reactively mid-scroll, which is what actually keeps
	     them visually pinned frame-to-frame. -->
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-50 bg-paper"
		style="height: env(safe-area-inset-top); transform: translateZ(0); will-change: transform;"
		aria-hidden="true"
	></div>
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
