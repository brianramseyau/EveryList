<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { anchorPanel } from '$lib/actions/anchor-panel';
	import { pickerCoordinator } from '$lib/stores/picker-coordinator.svelte';

	let { value, onselect }: { value: string; onselect: (color: string) => void } = $props();

	const id = Symbol('color-picker');
	let containerEl: HTMLDivElement | undefined = $state();

	// A fixed Tailwind-500 swatch set rather than a raw <input type="color"> —
	// keeps every list/store color visually consistent instead of arbitrary
	// user-picked hues, matching IconPicker.svelte's curated-picker pattern.
	const PALETTE = [
		'#ef4444',
		'#f97316',
		'#f59e0b',
		'#eab308',
		'#84cc16',
		'#22c55e',
		'#10b981',
		'#14b8a6',
		'#06b6d4',
		'#0ea5e9',
		'#3b82f6',
		'#6366f1',
		'#8b5cf6',
		'#a855f7',
		'#d946ef',
		'#ec4899',
		'#f43f5e',
		'#6b7280'
	];

	let open = $derived(pickerCoordinator.activeId === id);

	function pick(color: string) {
		onselect(color);
		pickerCoordinator.close(id);
	}
</script>

<div class="relative" bind:this={containerEl}>
	<Button
		type="button"
		color="alternative"
		onclick={() => pickerCoordinator.toggle(id)}
		class="flex items-center gap-2"
	>
		<span class="h-5 w-5 shrink-0 rounded-full" style:background-color={value} aria-hidden="true"
		></span>
		<span class="text-sm">Color</span>
	</Button>

	{#if open && containerEl}
		<div
			use:anchorPanel={containerEl}
			class="fixed z-10 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="grid grid-cols-6 gap-2">
				{#each PALETTE as color (color)}
					<button
						type="button"
						class="h-6 w-6 rounded-full ring-offset-2 ring-offset-white outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:ring-offset-gray-800"
						class:ring-2={color === value}
						class:ring-gray-900={color === value}
						class:dark:ring-white={color === value}
						style:background-color={color}
						title={color}
						aria-label={color}
						onclick={() => pick(color)}
					></button>
				{/each}
			</div>
		</div>
	{/if}
</div>
