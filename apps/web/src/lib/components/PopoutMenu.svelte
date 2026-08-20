<script lang="ts">
	import type { Snippet } from 'svelte';
	import { anchorPanel } from '$lib/actions/anchor-panel';
	import Icon from './Icon.svelte';

	// Shared popout-menu primitive (PHASE9_PLAN.md #1/#10): a trigger icon
	// button plus an anchor-panel-positioned list of links or action buttons,
	// with click-outside and Escape-to-close — the behavior ListMenu.svelte
	// used to hand-roll for itself with no viewport clamping. `children`
	// receives a `close` function so an item that performs an action (rather
	// than navigating) can dismiss the panel itself.
	let {
		label,
		iconName,
		children
	}: {
		label: string;
		iconName: string;
		children: Snippet<[close: () => void]>;
	} = $props();

	let open = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function handleWindowClick(event: MouseEvent) {
		if (!open || !containerEl) return;
		if (!containerEl.contains(event.target as Node)) close();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') close();
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="relative" bind:this={containerEl}>
	<button
		type="button"
		onclick={toggle}
		aria-label={label}
		aria-expanded={open}
		class="flex h-11 w-11 items-center justify-center text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
	>
		<Icon name={iconName} class="h-6 w-6" />
	</button>

	{#if open && containerEl}
		<div
			use:anchorPanel={containerEl}
			class="fixed z-10 min-w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			{@render children(close)}
		</div>
	{/if}
</div>
