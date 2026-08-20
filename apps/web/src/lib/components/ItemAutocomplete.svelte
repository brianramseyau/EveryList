<script lang="ts">
	import { Input } from 'flowbite-svelte';
	import Icon from './Icon.svelte';
	import { fetchFavorites } from '$lib/api/favorites';
	import { fetchRecentItemNames } from '$lib/api/items';
	import { anchorPanel } from '$lib/actions/anchor-panel';
	import {
		filterSuggestions,
		mergeSuggestions,
		type AutocompleteSuggestion
	} from '$lib/autocomplete';
	import type { Snippet } from 'svelte';

	let {
		listId,
		value = $bindable(''),
		existingNames,
		disabled = false,
		right,
		onselect,
		onfocuschange
	}: {
		listId: number;
		value: string;
		/** Names already on the list (any state) — used to badge a suggestion that's already there. */
		existingNames: string[];
		disabled?: boolean;
		/** Rendered inside the input's right edge, so it reads as part of the field. */
		right?: Snippet;
		onselect?: (name: string) => void;
		onfocuschange?: (focused: boolean) => void;
	} = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let suggestions = $state<AutocompleteSuggestion[]>([]);
	let focused = $state(false);
	let loaded = false;

	async function ensureLoaded() {
		// Only fetched once per mount — the add-item form stays on screen for the
		// whole session, so there's no need to refetch on every focus.
		if (loaded) return;
		loaded = true;
		const [favorites, recentNames] = await Promise.all([
			fetchFavorites(listId).catch(() => []),
			fetchRecentItemNames(listId).catch(() => [])
		]);
		suggestions = mergeSuggestions(
			favorites.map((favorite) => favorite.name),
			recentNames
		);
	}

	const existingSet = $derived(new Set(existingNames.map((name) => name.trim().toLowerCase())));
	const matches = $derived(focused ? filterSuggestions(suggestions, value) : []);

	function handleFocus() {
		focused = true;
		onfocuschange?.(true);
		void ensureLoaded();
	}

	function handleBlur() {
		// A plain blur fires before a suggestion button's click event — delay
		// closing the panel so that click still lands.
		setTimeout(() => {
			focused = false;
			onfocuschange?.(false);
		}, 150);
	}

	function pick(name: string) {
		// Picking a suggestion adds it right away (see the parent's onselect) —
		// clear rather than fill, so the input never shows a name that's about
		// to be submitted out from under it.
		value = '';
		focused = false;
		onselect?.(name);
	}
</script>

<div class="flex-1" bind:this={containerEl}>
	<Input
		placeholder="Item name"
		bind:value
		{disabled}
		{right}
		onfocus={handleFocus}
		onblur={handleBlur}
		class={right ? 'pr-11' : undefined}
	/>
</div>

{#if matches.length > 0 && containerEl}
	<ul
		use:anchorPanel={containerEl}
		class="fixed z-20 max-h-56 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
	>
		{#each matches as suggestion (suggestion.name)}
			<li>
				<button
					type="button"
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-900"
					onclick={() => pick(suggestion.name)}
				>
					<span class="flex-1 truncate">{suggestion.name}</span>
					{#if suggestion.isFavorite}
						<Icon name="heart" class="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
					{/if}
					{#if existingSet.has(suggestion.name.trim().toLowerCase())}
						<span title="Already on this list">
							<Icon name="checkCircle" class="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
						</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}
