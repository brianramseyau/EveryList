<script lang="ts">
	import { Input, Label, Select, Textarea } from 'flowbite-svelte';
	import type { CategoryDto, StoreDto } from '@everylist/shared';
	import Icon from '$lib/components/Icon.svelte';

	let {
		name = $bindable(''),
		quantity = $bindable(''),
		price = $bindable(''),
		categoryId = $bindable(null),
		storeId = $bindable(null),
		notes = $bindable(''),
		categories,
		stores,
		showCategory = true,
		autofocusName = true
	}: {
		name?: string;
		quantity?: string;
		price?: string;
		categoryId?: number | null;
		storeId?: number | null;
		notes?: string;
		categories: CategoryDto[];
		stores: StoreDto[];
		showCategory?: boolean;
		autofocusName?: boolean;
	} = $props();
</script>

<div class="flex flex-col gap-1">
	<Label for="item-name" class="flex items-center gap-1">
		<Icon name="pencil" class="h-4 w-4" />
		Name
	</Label>
	<Input id="item-name" bind:value={name} autofocus={autofocusName} />
</div>

<div class="flex flex-col gap-1">
	<Label for="item-quantity" class="flex items-center gap-1">
		<Icon name="counter" class="h-4 w-4" />
		Quantity (optional)
	</Label>
	<Input id="item-quantity" placeholder="e.g. 2, 1 lb, a dozen" bind:value={quantity} />
</div>

<div class="flex flex-col gap-1">
	<Label for="item-price" class="flex items-center gap-1">
		<Icon name="currencyUsd" class="h-4 w-4" />
		Price (optional)
	</Label>
	<Input id="item-price" inputmode="decimal" placeholder="0.00" bind:value={price} />
</div>

{#if showCategory}
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
			value={categoryId ?? ''}
			onchange={(event) => {
				const raw = (event.target as HTMLSelectElement).value;
				categoryId = raw === '' ? null : Number(raw);
			}}
		/>
	</div>
{/if}

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
			value={storeId ?? ''}
			onchange={(event) => {
				const raw = (event.target as HTMLSelectElement).value;
				storeId = raw === '' ? null : Number(raw);
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
		bind:value={notes}
		class="w-full border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700"
	/>
</div>
