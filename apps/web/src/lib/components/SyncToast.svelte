<script lang="ts">
	import { Button } from 'flowbite-svelte';

	let {
		visible,
		onrefresh,
		ondismiss
	}: {
		visible: boolean;
		onrefresh: () => void;
		ondismiss: () => void;
	} = $props();
</script>

{#if visible}
	<div
		role="status"
		class="fixed inset-x-4 bottom-20 z-20 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
	>
		<span class="text-sm">This list was updated</span>
		<div class="flex shrink-0 items-center gap-2">
			<Button type="button" size="xs" onclick={onrefresh}>Refresh</Button>
			<Button type="button" size="xs" color="alternative" onclick={ondismiss}>Dismiss</Button>
		</div>
	</div>
{/if}
