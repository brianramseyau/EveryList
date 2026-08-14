<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { getToken } from '$lib/api/token';
	import { initTheme } from '$lib/theme';
	import { startFlushLoop } from '$lib/offline/flush';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';

	let { children } = $props();

	let loggedIn = $state(false);

	function refreshAuth() {
		loggedIn = Boolean(getToken());
	}

	onMount(() => {
		initTheme();
		refreshAuth();
		startFlushLoop();
	});
	afterNavigate(refreshAuth);

	const navSections = ['/lists', '/settings'];
	const showNav = $derived(
		loggedIn && navSections.some((section) => page.url.pathname.startsWith(section))
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
	<div class={showNav ? 'pb-16' : ''}>
		{@render children()}
	</div>
	{#if showNav}
		<BottomNav />
	{/if}
	{#if loggedIn}
		<SyncStatusBanner />
	{/if}
</div>
