<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Input, Label } from 'flowbite-svelte';
	import { getToken } from '$lib/api/token';
	import { createList } from '$lib/api/lists';
	import { ApiError } from '$lib/api/client';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ListFeatureToggles from '$lib/components/ListFeatureToggles.svelte';
	import {
		DEFAULT_FEATURE_VALUES,
		LIST_PREFABS,
		type BooleanFeatureField,
		type ListFeatureValues
	} from '$lib/list-prefabs';

	const DEFAULT_COLOR = '#3b82f6';
	const DEFAULT_ICON = 'formatListChecks';

	let name = $state('');
	let color = $state(DEFAULT_COLOR);
	let icon = $state(DEFAULT_ICON);
	let prefabId = $state(LIST_PREFABS[0]!.id);
	let customValues = $state<ListFeatureValues>({ ...DEFAULT_FEATURE_VALUES });
	// Loose (string | number) for the same reason as the settings page's open-item-limit
	// draft — a Flowbite number input hands back numbers, and null when emptied.
	let openItemLimitText = $state<string | number>('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	const selectedPrefab = $derived(LIST_PREFABS.find((prefab) => prefab.id === prefabId)!);
	const isCustom = $derived(selectedPrefab.values === null);

	function toggleCustomField(field: BooleanFeatureField) {
		customValues = { ...customValues, [field]: !customValues[field] };
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
		}
	});

	async function save() {
		if (!name.trim() || saving) return;

		// Mirrors the settings page's applyLimitDraft validation — the Save button is
		// type="button" outside the form, and handleSubmit's preventDefault skips native
		// number-input validation, so an out-of-range or non-whole value would otherwise
		// reach the backend's `vine.number().range([1, 999]).withoutDecimals()` validator
		// as a 422, or (if Number() maps a malformed value to NaN) get silently dropped by
		// JSON.stringify turning NaN into null. Only runs while the field is actually shown —
		// otherwise a stale draft left over from a previous prefab selection could block
		// saving Shopping or Custom, which never read it.
		let maxUncheckedItems: number | undefined;
		if (selectedPrefab.showOpenItemLimit) {
			const trimmedLimit = String(openItemLimitText ?? '').trim();
			if (trimmedLimit !== '') {
				const parsed = Number(trimmedLimit);
				if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
					error = 'Open item limit must be a whole number between 1 and 999.';
					return;
				}
				maxUncheckedItems = parsed;
			}
		}

		saving = true;
		try {
			await createList({
				name: name.trim(),
				color,
				icon,
				...(selectedPrefab.values ?? customValues),
				...(selectedPrefab.itemSortOrder ? { itemSortOrder: selectedPrefab.itemSortOrder } : {}),
				...(maxUncheckedItems !== undefined ? { maxUncheckedItems } : {})
			});
			await goto(resolve('/lists'));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create list.';
			saving = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
</script>

<main
	class="mx-auto flex app-max-w flex-col gap-4 px-8 pt-[max(env(safe-area-inset-top),2rem)] pb-8"
>
	<PageHeader title="New List" backHref={resolve('/lists')} backLabel="Cancel">
		{#snippet actions()}
			<Button type="button" size="sm" disabled={saving || !name.trim()} onclick={save}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div class="flex flex-col gap-1">
			<Label for="new-list-name">List Name</Label>
			<Input id="new-list-name" placeholder="List name" bind:value={name} autofocus />
		</div>

		<div class="flex items-center justify-between">
			<Label>Icon</Label>
			<IconPicker value={icon} onselect={(selected) => (icon = selected)} hint={name} />
		</div>

		<div class="flex items-center justify-between">
			<Label>Theme</Label>
			<ColorPicker value={color} onselect={(selected) => (color = selected)} />
		</div>

		<div class="flex flex-col gap-2">
			<Label>List type</Label>
			{#each LIST_PREFABS as prefab (prefab.id)}
				<button
					type="button"
					class="w-full rounded-lg border px-3 py-3 text-left {prefabId === prefab.id
						? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
						: 'border-gray-200 dark:border-gray-700'}"
					aria-pressed={prefabId === prefab.id}
					onclick={() => (prefabId = prefab.id)}
				>
					<span class="block font-medium text-gray-900 dark:text-white">{prefab.label}</span>
					<span class="block text-sm text-gray-500 dark:text-gray-400">{prefab.description}</span>
				</button>
			{/each}
		</div>

		{#if selectedPrefab.showOpenItemLimit}
			<div class="flex flex-col gap-1">
				<Label for="new-list-open-item-limit">Open item limit (optional)</Label>
				<Input
					id="new-list-open-item-limit"
					type="number"
					min={1}
					max={999}
					placeholder="No limit"
					bind:value={openItemLimitText}
				/>
			</div>
		{/if}

		{#if isCustom}
			<ListFeatureToggles values={customValues} onToggle={toggleCustomField} />
		{/if}
	</form>
</main>
