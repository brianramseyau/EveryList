<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	type NavKey = 'lists' | 'favorites' | 'settings';

	const items: { key: NavKey; label: string; match: string }[] = [
		{ key: 'lists', label: 'Lists', match: '/lists' },
		{ key: 'favorites', label: 'Favorites', match: '/favorites' },
		{ key: 'settings', label: 'Settings', match: '/settings' }
	];

	function isActive(match: string): boolean {
		return page.url.pathname === match || page.url.pathname.startsWith(`${match}/`);
	}
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-700 dark:bg-gray-900"
	aria-label="Primary"
>
	{#each items as item (item.key)}
		{@const active = isActive(item.match)}
		<a
			href={item.key === 'lists'
				? resolve('/lists')
				: item.key === 'favorites'
					? resolve('/favorites')
					: resolve('/settings')}
			aria-current={active ? 'page' : undefined}
			class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium {active
				? 'text-primary-600 dark:text-primary-400'
				: 'text-gray-500 dark:text-gray-400'}"
		>
			{#if item.key === 'lists'}
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
			{:else if item.key === 'favorites'}
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
					<path
						d="M12 3.3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.3l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3.3z"
					/>
				</svg>
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
</nav>
