<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import Icon from './Icon.svelte';
	import { loadMdiIcons, fromMdiExportName, toDisplayLabel } from '$lib/icons/mdi';

	let { value, onselect }: { value: string; onselect: (name: string) => void } = $props();

	let open = $state(false);
	let loading = $state(false);
	let search = $state('');
	let names = $state<string[] | null>(null);

	// Capped rather than a true virtualized/windowed grid (see PLAN.md §4) —
	// filtering by search already keeps the rendered set small in practice,
	// and requiring at least 2 characters avoids ever building all ~7,000
	// buttons at once.
	const MAX_RESULTS = 60;
	const matches = $derived.by(() => {
		if (!names || search.trim().length < 2) return [];
		const needle = search.trim().toLowerCase();
		const found: string[] = [];
		for (const name of names) {
			if (found.length >= MAX_RESULTS) break;
			if (name.toLowerCase().includes(needle)) found.push(name);
		}
		return found;
	});

	async function togglePicker() {
		open = !open;
		if (open && !names) {
			loading = true;
			const icons = await loadMdiIcons();
			names = Object.keys(icons).map(fromMdiExportName);
			loading = false;
		}
	}

	function pick(name: string) {
		onselect(name);
		open = false;
		search = '';
	}
</script>

<div class="relative">
	<Button type="button" color="alternative" onclick={togglePicker} class="flex items-center gap-2">
		<Icon name={value} class="h-5 w-5" />
		<span class="text-sm">{toDisplayLabel(value)}</span>
	</Button>

	{#if open}
		<div
			class="absolute z-10 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			<Input placeholder="Search icons…" bind:value={search} autofocus />

			{#if loading}
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading icons…</p>
			{:else if search.trim().length < 2}
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Type at least 2 characters…</p>
			{:else if matches.length === 0}
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">No icons match "{search}".</p>
			{:else}
				<div class="mt-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
					{#each matches as name (name)}
						<button
							type="button"
							class="hover:bg-primary-100 dark:hover:bg-primary-900 flex items-center justify-center rounded p-2"
							title={toDisplayLabel(name)}
							onclick={() => pick(name)}
						>
							<Icon {name} class="h-5 w-5" />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
