<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getBadgeCount, isBadgingSupported, onBadgeCountChange } from '$lib/pwa/badge';
	import { markSkipTransition } from '$lib/nav-direction';

	type NavKey = 'lists' | 'settings';

	const items: { key: NavKey; label: string; match: string }[] = [
		{ key: 'lists', label: 'Lists', match: '/lists' },
		{ key: 'settings', label: 'Settings', match: '/settings' }
	];

	function isActive(match: string): boolean {
		return page.url.pathname === match || page.url.pathname.startsWith(`${match}/`);
	}

	// The OS-level app icon badge (Web Badging API) already shows this count where
	// supported — this pill is the in-app fallback for browsers that don't (iOS Safari,
	// Firefox), see PLAN.md §16.
	let badgeCount = $state(getBadgeCount());

	onMount(() => {
		onBadgeCountChange((count) => (badgeCount = count));
	});
	onDestroy(() => {
		onBadgeCountChange(null);
	});
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-700 dark:bg-gray-900"
	aria-label="Primary"
>
	<div class="mx-auto flex w-full app-max-w">
		{#each items as item (item.key)}
			{@const active = isActive(item.match)}
			<a
				href={item.key === 'lists' ? resolve('/lists') : resolve('/settings')}
				onclick={markSkipTransition}
				aria-current={active ? 'page' : undefined}
				class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium {active
					? 'text-primary-700 dark:text-primary-400'
					: 'text-gray-600 dark:text-gray-400'}"
			>
				{#if item.key === 'lists'}
					<div class="relative">
						<svg
							class="h-6 w-6"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M9 6h11M9 12h11M9 18h11" />
							<circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
							<circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
							<circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
						</svg>
						{#if !isBadgingSupported() && badgeCount > 0}
							<span
								class="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
							>
								{badgeCount > 99 ? '99+' : badgeCount}
							</span>
						{/if}
					</div>
				{:else}
					<svg
						class="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="3" />
						<path
							d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.2a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.2a1.7 1.7 0 00-1.6 1z"
						/>
					</svg>
				{/if}
				<span>{item.label}</span>
			</a>
		{/each}
	</div>
</nav>
