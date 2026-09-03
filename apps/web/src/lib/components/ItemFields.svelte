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
		deadlineDate = $bindable(''),
		deadlineTime = $bindable(''),
		categories,
		stores,
		showCategory = true,
		showQuantity = true,
		showPrice = true,
		showStore = true,
		showDeadline = false,
		autofocusName = true
	}: {
		name?: string;
		quantity?: string;
		price?: string;
		categoryId?: number | null;
		storeId?: number | null;
		notes?: string;
		/** 'YYYY-MM-DD' or '' when unset — deadline editing requires a date first. */
		deadlineDate?: string;
		/** 'HH:mm' or '' when unset — only editable once a date is set (PLAN_24). */
		deadlineTime?: string;
		categories: CategoryDto[];
		stores: StoreDto[];
		showCategory?: boolean;
		showQuantity?: boolean;
		showPrice?: boolean;
		showStore?: boolean;
		showDeadline?: boolean;
		autofocusName?: boolean;
	} = $props();

	// A time is only meaningful with a date — whenever the date is unset the
	// time draft resets too (PLAN_24: "time would require a date to be set").
	// An effect rather than an onchange handler so it holds no matter HOW the
	// date input is cleared (Chromium notably doesn't fire `change` when a
	// date input's value is programmatically emptied, only `input`), and it
	// also normalizes any pre-filled date-less state on mount.
	$effect(() => {
		if (!deadlineDate) deadlineTime = '';
	});
</script>

<div class="flex flex-col gap-1">
	<Label for="item-name" class="flex items-center gap-1">
		<Icon name="pencil" class="h-4 w-4" />
		Name
	</Label>
	<Input id="item-name" bind:value={name} autofocus={autofocusName} />
</div>

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

{#if showQuantity || showPrice}
	<div class="grid grid-cols-2 gap-4">
		{#if showQuantity}
			<div class="flex flex-col gap-1" class:col-span-2={!showPrice}>
				<Label for="item-quantity" class="flex items-center gap-1">
					<Icon name="counter" class="h-4 w-4" />
					Quantity (optional)
				</Label>
				<Input id="item-quantity" placeholder="e.g. 2, 1 lb, a dozen" bind:value={quantity} />
			</div>
		{/if}

		{#if showPrice}
			<div class="flex flex-col gap-1" class:col-span-2={!showQuantity}>
				<Label for="item-price" class="flex items-center gap-1">
					<Icon name="currencyUsd" class="h-4 w-4" />
					Price (optional)
				</Label>
				<Input id="item-price" inputmode="decimal" placeholder="0.00" bind:value={price} />
			</div>
		{/if}
	</div>
{/if}

{#if showDeadline}
	<div class="grid grid-cols-2 gap-4">
		<div class="flex flex-col gap-1" class:col-span-2={!deadlineDate}>
			<Label for="item-deadline-date" class="flex items-center gap-1">
				<Icon name="calendar" class="h-4 w-4" />
				Required by (optional)
			</Label>
			<Input id="item-deadline-date" type="date" bind:value={deadlineDate} />
		</div>

		{#if deadlineDate}
			<div class="flex flex-col gap-1">
				<Label for="item-deadline-time" class="flex items-center gap-1">
					<Icon name="clockOutline" class="h-4 w-4" />
					Time (optional)
				</Label>
				<Input id="item-deadline-time" type="time" bind:value={deadlineTime} />
			</div>
		{/if}
	</div>
{/if}

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

{#if showStore && stores.length > 0}
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
