<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { getToken } from '$lib/api/token';
	import { initTheme } from '$lib/theme';
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { children } = $props();

	let loggedIn = $state(false);

	function refreshAuth() {
		loggedIn = Boolean(getToken());
	}

	onMount(() => {
		initTheme();
		refreshAuth();
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
</div>
