<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, Input, Label, Select, Textarea } from 'flowbite-svelte';
	import type { CategoryDto, ItemDto, ListDto, StoreDto } from '@everylist/shared';
	import { getToken } from '$lib/api/token';
	import { fetchList } from '$lib/api/lists';
	import { fetchCategories } from '$lib/api/categories';
	import { fetchItems, updateItem } from '$lib/api/items';
	import { fetchStores } from '$lib/api/stores';
	import { getDb } from '$lib/offline/db';
	import { ApiError } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const listId = $derived(Number(page.params.id));
	const itemId = $derived(Number(page.params.itemId));

	let list = $state<ListDto | null>(null);
	let item = $state<ItemDto | null>(null);
	let categories = $state<CategoryDto[]>([]);
	let stores = $state<StoreDto[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);

	let draftName = $state('');
	let draftQuantity = $state('');
	let draftNotes = $state('');
	let draftPrice = $state('');
	let draftCategoryId = $state<number | null>(null);
	let draftStoreId = $state<number | null>(null);

	// Offline-first: an item opened from the list-detail page is already in
	// Dexie, so this reads locally first (works with zero network, matching
	// every other list-scoped screen) and only falls back to a full list
	// fetch for a cold direct-navigation/reload that never cached this item.
	async function loadItem(): Promise<ItemDto | null> {
		const db = getDb();
		const cached = db ? await db.items.get(itemId) : undefined;
		if (cached) return cached;
		const items = await fetchItems(listId);
		return items.find((current) => current.id === itemId) ?? null;
	}

	async function loadAll() {
		loading = true;
		try {
			const [listResult, itemResult, categoriesResult, storesResult] = await Promise.all([
				fetchList(listId),
				loadItem(),
				fetchCategories(listId),
				fetchStores(listId)
			]);
			list = listResult;
			item = itemResult;
			categories = categoriesResult;
			stores = storesResult;

			if (item) {
				draftName = item.name;
				draftQuantity = item.quantity ?? '';
				draftNotes = item.notes ?? '';
				draftPrice = item.price !== null ? (item.price / 100).toFixed(2) : '';
				draftCategoryId = item.categoryId;
				draftStoreId = item.storeId;
				error = null;
			} else {
				error = 'Item not found.';
			}
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load item.';
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

	async function save() {
		if (!draftName.trim() || saving) return;
		const trimmedPrice = draftPrice.trim();
		const price = trimmedPrice === '' ? null : Math.round(Number(trimmedPrice) * 100);
		if (price !== null && !Number.isFinite(price)) return;

		saving = true;
		try {
			await updateItem(listId, itemId, {
				name: draftName.trim(),
				quantity: draftQuantity.trim() || null,
				notes: draftNotes.trim() || null,
				price,
				categoryId: draftCategoryId,
				storeId: draftStoreId
			});
			await goto(resolve('/lists/[id]', { id: String(listId) }));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save item.';
			saving = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void save();
	}
</script>

<svelte:head>
	<title>{item ? `${item.name} — EveryList` : 'Item — EveryList'}</title>
</svelte:head>

<main class="mx-auto flex max-w-lg flex-col gap-4 p-8">
	<PageHeader
		title={list ? `${list.name} — Item` : 'Item'}
		backHref={resolve('/lists/[id]', { id: String(listId) })}
		backLabel="Back to list"
	>
		{#snippet actions()}
			{#if item}
				<Button type="button" size="sm" disabled={saving || !draftName.trim()} onclick={save}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if loading}
		<p class="text-gray-600 dark:text-gray-400">Loading…</p>
	{:else if item}
		{#if error}
			<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
		{/if}

		<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
			<div class="flex flex-col gap-1">
				<Label for="item-name" class="flex items-center gap-1">
					<Icon name="pencil" class="h-4 w-4" />
					Name
				</Label>
				<Input id="item-name" bind:value={draftName} autofocus />
			</div>

			<div class="flex flex-col gap-1">
				<Label for="item-quantity" class="flex items-center gap-1">
					<Icon name="counter" class="h-4 w-4" />
					Quantity (optional)
				</Label>
				<Input id="item-quantity" placeholder="e.g. 2, 1 lb, a dozen" bind:value={draftQuantity} />
			</div>

			<div class="flex flex-col gap-1">
				<Label for="item-price" class="flex items-center gap-1">
					<Icon name="currencyUsd" class="h-4 w-4" />
					Price (optional)
				</Label>
				<Input id="item-price" inputmode="decimal" placeholder="0.00" bind:value={draftPrice} />
			</div>

			<div class="flex flex-col gap-1">
				<Label for="item-category" class="flex items-center gap-1">
					<Icon name="tagOutline" class="h-4 w-4" />
					Category
				</Label>
				<Select
					id="item-category"
					items={categories.map((category) => ({ value: category.id, name: category.name }))}
					placeholder="Uncategorized"
					clearable
					value={draftCategoryId ?? ''}
					onchange={(event) => {
						const raw = (event.target as HTMLSelectElement).value;
						draftCategoryId = raw === '' ? null : Number(raw);
					}}
				/>
			</div>

			{#if stores.length > 0}
				<div class="flex flex-col gap-1">
					<Label for="item-store" class="flex items-center gap-1">
						<Icon name="store" class="h-4 w-4" />
						Store
					</Label>
					<Select
						id="item-store"
						items={stores.map((store) => ({ value: store.id, name: store.name }))}
						placeholder="No store"
						clearable
						value={draftStoreId ?? ''}
						onchange={(event) => {
							const raw = (event.target as HTMLSelectElement).value;
							draftStoreId = raw === '' ? null : Number(raw);
						}}
					/>
				</div>
			{/if}

			<div class="flex flex-col gap-1">
				<Label for="item-notes" class="flex items-center gap-1">
					<Icon name="noteTextOutline" class="h-4 w-4" />
					Notes (optional)
				</Label>
				<Textarea
					id="item-notes"
					rows={3}
					bind:value={draftNotes}
					class="w-full border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700"
				/>
			</div>
		</form>
	{:else}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</main>
