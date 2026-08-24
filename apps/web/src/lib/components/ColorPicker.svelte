<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { anchorPanel } from '$lib/actions/anchor-panel';
	import { pickerCoordinator } from '$lib/stores/picker-coordinator.svelte';

	let { value, onselect }: { value: string; onselect: (color: string) => void } = $props();

	const id = Symbol('color-picker');
	let containerEl: HTMLDivElement | undefined = $state();

	// Curated Tailwind-500 swatches for one-click consistency, plus a native
	// color input + hex field below for anyone who wants an arbitrary hue.
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
	const isValidHex = (color: string) => /^#[0-9a-f]{6}$/i.test(color);

	let customHex = $derived(value);

	function pick(color: string) {
		onselect(color);
		pickerCoordinator.close(id);
	}

	function handleCustomInput(color: string) {
		customHex = color;
		if (isValidHex(color)) onselect(color);
	}

	function handleHexBlur() {
		if (isValidHex(customHex)) {
			onselect(customHex);
		} else {
			customHex = value;
		}
	}
</script>

<div class="relative" bind:this={containerEl}>
	<Button
		type="button"
		color="alternative"
		onclick={() => pickerCoordinator.toggle(id)}
		class="flex items-center gap-2"
		aria-label="Color"
	>
		<span class="h-5 w-5 shrink-0 rounded-full" style:background-color={value} aria-hidden="true"
		></span>
	</Button>

	{#if open && containerEl}
		<div
			use:anchorPanel={containerEl}
			class="fixed z-10 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
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

			<div class="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
				<label class="relative h-6 w-6 shrink-0 cursor-pointer" title="Custom color">
					<span
						class="pointer-events-none absolute inset-0 rounded-full ring-1 ring-gray-300 ring-inset dark:ring-gray-600"
						style:background-color={isValidHex(customHex) ? customHex : value}
						aria-hidden="true"
					></span>
					<input
						type="color"
						class="h-full w-full cursor-pointer opacity-0"
						value={isValidHex(customHex) ? customHex : value}
						oninput={(e) => handleCustomInput(e.currentTarget.value)}
						aria-label="Pick a custom color"
					/>
				</label>
				<input
					type="text"
					class="w-full min-w-0 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-900 outline-none focus:border-primary-500 dark:border-gray-600 dark:text-white"
					value={customHex}
					maxlength={7}
					spellcheck="false"
					oninput={(e) => (customHex = e.currentTarget.value)}
					onblur={handleHexBlur}
					onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
					aria-label="Custom hex color"
				/>
			</div>
		</div>
	{/if}
</div>
