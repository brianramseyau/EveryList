<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Checkbox, Input, Radio } from 'flowbite-svelte';
	import type { ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { attachStore, detachStore, fetchStores, updateStore } from '$lib/api/stores';
	import { getSelectedStoreSettings, setSelectedStoreSettings } from '$lib/api/selected-store';
	import { ApiError } from '$lib/api/client';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const DEFAULT_COLOR = '#3b82f6';

	const listId = $derived(Number(page.params.id));

	let list = $state<ListDto | null>(null);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let newStoreName = $state('');
	let newStoreColor = $state(DEFAULT_COLOR);
	let creating = $state(false);

	let selectedStoreId = $state<number | null>(null);
	let includeUnassigned = $state(false);

	let editingStoreId = $state<number | null>(null);
	let editName = $state('');
	let editColor = $state(DEFAULT_COLOR);
	let savingStoreId = $state<number | null>(null);

	async function loadAll() {
		loading = true;
		try {
			[list, stores] = await Promise.all([fetchList(listId), fetchStores(listId)]);
			const settings = await getSelectedStoreSettings(listId);
			selectedStoreId = settings.storeId;
			includeUnassigned = settings.includeUnassigned;
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load stores.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!getToken()) {
			void goto(resolve('/login'));
			return;
		}
		void loadAll();
	});

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		if (!newStoreName.trim()) return;
		creating = true;
		try {
			const store = await attachStore(listId, {
				name: newStoreName.trim(),
				color: newStoreColor
			});
			stores = [...stores, store];
			newStoreName = '';
			newStoreColor = DEFAULT_COLOR;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to create store.';
		} finally {
			creating = false;
		}
	}

	function startEdit(store: StoreDto) {
		editingStoreId = store.id;
		editName = store.name;
		editColor = store.color;
	}

	function cancelEdit() {
		editingStoreId = null;
	}

	async function saveStoreEdit(store: StoreDto) {
		const trimmedName = editName.trim();
		if (!trimmedName) return;
		savingStoreId = store.id;
		try {
			const updated = await updateStore(store.id, { name: trimmedName, color: editColor });
			stores = stores.map((current) =>
				current.id === store.id
					? (updated ?? { ...current, name: trimmedName, color: editColor })
					: current
			);
			editingStoreId = null;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to update store.';
		} finally {
			savingStoreId = null;
		}
	}

	async function removeStore(store: StoreDto) {
		stores = stores.filter((current) => current.id !== store.id);
		if (selectedStoreId === store.id) selectedStoreId = null;
		try {
			await detachStore(listId, store.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to remove store.';
			void loadAll();
		}
	}

	// "Currently shopping at" is local-only (see $lib/api/selected-store.ts) — persist
	// whenever the selection changes, including the initial load's restore.
	$effect(() => {
		if (!loading)
			void setSelectedStoreSettings(listId, { storeId: selectedStoreId, includeUnassigned });
	});
</script>

<svelte:head>
	<title>{list ? `${list.name} stores — EveryList` : 'Stores — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${list.name} — Stores` : undefined}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	/>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if list}
		<p class="text-sm text-gray-600 dark:text-gray-300">
			Pick the store you're shopping at so categories match its aisle layout. This choice is only
			remembered on this device.
		</p>

		<form class="flex flex-wrap gap-2" onsubmit={handleCreate}>
			<div class="min-w-40 flex-1">
				<Input placeholder="New store name" bind:value={newStoreName} />
			</div>
			<ColorPicker value={newStoreColor} onselect={(color) => (newStoreColor = color)} />
			<Button type="submit" disabled={creating || !newStoreName.trim()}>Add</Button>
		</form>

		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		{#if stores.length === 0}
			<p class="text-gray-600 dark:text-gray-400">No stores yet — add one above.</p>
		{:else}
			<ul class="flex flex-col gap-2">
				<li>
					<Radio bind:group={selectedStoreId} value={null}>No store selected (default order)</Radio>
				</li>
				{#each stores as store (store.id)}
					<li class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
						{#if editingStoreId === store.id}
							<form
								class="flex flex-wrap items-center gap-2"
								onsubmit={(event) => {
									event.preventDefault();
									void saveStoreEdit(store);
								}}
							>
								<div class="min-w-40 flex-1">
									<Input aria-label="Store name" bind:value={editName} autofocus />
								</div>
								<ColorPicker value={editColor} onselect={(color) => (editColor = color)} />
								<Button
									type="submit"
									size="xs"
									disabled={savingStoreId === store.id || !editName.trim()}
								>
									{savingStoreId === store.id ? 'Saving…' : 'Save'}
								</Button>
								<Button type="button" size="xs" color="alternative" onclick={cancelEdit}>
									Cancel
								</Button>
							</form>
						{:else}
							<div class="flex items-center gap-2">
								<span
									class="h-4 w-4 shrink-0 rounded-full"
									style:background-color={store.color}
									aria-hidden="true"
								></span>
								<Radio bind:group={selectedStoreId} value={store.id}>
									{store.name}
								</Radio>
								<button
									type="button"
									aria-label={`Rename ${store.name}`}
									class="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
									onclick={() => startEdit(store)}
								>
									<Icon name="pencil" class="h-4 w-4" />
								</button>
								<a
									href={resolve('/lists/[id]/stores/[storeId]', {
										id: String(listId),
										storeId: String(store.id)
									})}
									class="ml-auto text-xs text-primary-700 underline dark:text-primary-400"
								>
									Reorder categories
								</a>
								<button
									type="button"
									class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
									onclick={() => removeStore(store)}
								>
									Remove
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if selectedStoreId !== null}
			<Checkbox bind:checked={includeUnassigned}>
				Also show items not assigned to any store
			</Checkbox>
			<p class="text-sm text-gray-500 dark:text-gray-400">
				Keeps unassigned items on the list while you shop the selected store. Remembered on this
				device.
			</p>
		{/if}
	{:else}
		<!-- Reachable only once loadAll's finally has run: loading is false, and
		     its catch always sets `error` when it leaves `list` unset. -->
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
