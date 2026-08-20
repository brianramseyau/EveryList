<script lang="ts">
	import { resolve } from '$app/paths';
	import { connectivity } from '$lib/offline/connectivity.svelte';
	import Icon from './Icon.svelte';
</script>

{#if connectivity.serverUnavailable}
	<a
		href={resolve('/settings/sync')}
		aria-label="Server unavailable — tap for sync status"
		title="Server unavailable"
		class="fixed right-2 z-40 flex items-center justify-center rounded-full border border-amber-200 bg-white/90 p-2 text-amber-600 shadow-sm dark:border-amber-900 dark:bg-gray-900/90 dark:text-amber-400 print:hidden"
		style="top: calc(env(safe-area-inset-top) + 0.5rem)"
	>
		<Icon name="cloudOffOutline" class="h-5 w-5" />
	</a>
{/if}
