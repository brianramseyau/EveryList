<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';

	let { listId }: { listId: number } = $props();

	let open = $state(false);
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-label="List settings"
		aria-expanded={open}
		class="text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
	>
		<Icon name="cog" class="h-5 w-5" />
	</button>

	{#if open}
		<div
			class="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			<a
				href={resolve('/lists/[id]/categories', { id: String(listId) })}
				class="block rounded px-2 py-1.5 text-sm text-primary-600 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
			>
				Categories
			</a>
			<a
				href={resolve('/lists/[id]/members', { id: String(listId) })}
				class="block rounded px-2 py-1.5 text-sm text-primary-600 hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
			>
				Members
			</a>
		</div>
	{/if}
</div>
