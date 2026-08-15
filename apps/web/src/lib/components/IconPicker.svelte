<script lang="ts">
	import { Button, Input } from 'flowbite-svelte';
	import Icon from './Icon.svelte';
	import { loadMdiIcons, fromMdiExportName, toDisplayLabel } from '$lib/icons/mdi';
	import { anchorPanel } from '$lib/actions/anchor-panel';
	import { pickerCoordinator } from '$lib/stores/picker-coordinator.svelte';

	let { value, onselect }: { value: string; onselect: (name: string) => void } = $props();

	const id = Symbol('icon-picker');
	let containerEl: HTMLDivElement | undefined = $state();

	let open = $derived(pickerCoordinator.activeId === id);
	let loading = $state(false);
	let search = $state('');
	let names = $state<string[] | null>(null);
	let scrollTop = $state(0);
	let scrollEl: HTMLDivElement | undefined = $state();

	// Shown before the user types a search, so opening the picker isn't just
	// a blank "type to search" prompt — a handful of icons relevant to a
	// shopping list app, verified to exist in @mdi/js.
	const DEFAULT_ICONS = [
		'cart',
		'basket',
		'foodApple',
		'breadSlice',
		'cheese',
		'carrot',
		'foodDrumstick',
		'fish',
		'egg',
		'coffee',
		'bottleSoda',
		'snowflake'
	];

	const matches = $derived.by(() => {
		// `matches` is only ever read once `loading` is false, and `loading`
		// only ever goes false after `names` is assigned — so this guard
		// can't actually fire from the UI. It stays as a type-safety guard
		// for the `.filter`/`.includes` calls below.
		/* v8 ignore next */
		if (!names) return [];
		const needle = search.trim().toLowerCase();
		if (needle.length < 2) return DEFAULT_ICONS.filter((name) => names!.includes(name));
		return names.filter((name) => name.toLowerCase().includes(needle));
	});

	// True windowed grid, not just a result cap (see PLAN.md §4) — only the
	// rows scrolled into view (plus a small overscan) ever hit the DOM, so
	// the rendered node count stays flat whether a search matches 5 icons or
	// 500.
	const COLS = 6;
	const ROW_HEIGHT = 40;
	const VIEWPORT_HEIGHT = 192;
	const OVERSCAN_ROWS = 2;

	const totalRows = $derived(Math.ceil(matches.length / COLS));
	const visibleRowCount = $derived(Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN_ROWS * 2);
	const startRow = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS));
	const endRow = $derived(Math.min(totalRows, startRow + visibleRowCount));
	const visibleMatches = $derived(matches.slice(startRow * COLS, endRow * COLS));
	const topPadding = $derived(startRow * ROW_HEIGHT);
	const bottomPadding = $derived((totalRows - endRow) * ROW_HEIGHT);

	function handleScroll(event: Event) {
		scrollTop = (event.currentTarget as HTMLDivElement).scrollTop;
	}

	// A new search invalidates the previous scroll offset — without this,
	// scrolling deep into one search then typing a narrower one would leave
	// the window stuck past the end of the new (shorter) match list.
	$effect(() => {
		void search;
		scrollTop = 0;
		if (scrollEl) scrollEl.scrollTop = 0;
	});

	async function togglePicker() {
		const opening = pickerCoordinator.activeId !== id;
		pickerCoordinator.toggle(id);
		if (opening && !names) {
			loading = true;
			const icons = await loadMdiIcons();
			names = Object.keys(icons).map(fromMdiExportName);
			loading = false;
		}
	}

	function pick(name: string) {
		onselect(name);
		pickerCoordinator.close(id);
		search = '';
	}
</script>

<div class="relative" bind:this={containerEl}>
	<Button
		type="button"
		color="alternative"
		onclick={togglePicker}
		class="flex items-center gap-2"
		aria-label={toDisplayLabel(value)}
	>
		<Icon name={value} class="h-5 w-5" />
	</Button>

	{#if open && containerEl}
		<div
			use:anchorPanel={containerEl}
			class="fixed z-10 w-72 max-w-[calc(100vw-2rem)] overscroll-contain rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			<Input placeholder="Search icons…" bind:value={search} autofocus />

			{#if loading}
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading icons…</p>
			{:else if matches.length === 0}
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
					No icons match "<span>{search}</span>".
				</p>
			{:else}
				{#if search.trim().length < 2}
					<p class="mt-2 text-xs text-gray-600 dark:text-gray-400">Popular icons</p>
				{/if}
				<div
					bind:this={scrollEl}
					class="mt-2"
					style="max-height: {VIEWPORT_HEIGHT}px; overflow-y: auto; overscroll-behavior: contain;"
					onscroll={handleScroll}
					data-testid="icon-picker-results"
				>
					<div style:padding-top={`${topPadding}px`} style:padding-bottom={`${bottomPadding}px`}>
						<div class="grid grid-cols-6 gap-1">
							{#each visibleMatches as name (name)}
								<button
									type="button"
									class="flex items-center justify-center rounded p-2 hover:bg-primary-100 dark:hover:bg-primary-900"
									title={toDisplayLabel(name)}
									onclick={() => pick(name)}
								>
									<Icon {name} class="h-5 w-5" />
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
