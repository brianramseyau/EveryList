<script lang="ts">
	import { Button, Toggle } from 'flowbite-svelte';
	import type { BooleanFeatureField, ListFeatureValues } from '$lib/list-prefabs';

	const ROW_CLASS =
		'w-full flex-row-reverse items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-gray-700 dark:border-gray-700 dark:text-gray-200';
	const SUB_ROW_CLASS = `ml-4 ${ROW_CLASS}`;

	let {
		values,
		onToggle,
		confirmingCategoryLearningOff = false,
		onCategoryLearningToggleClick = () => onToggle('useCategoryLearning'),
		onConfirmCategoryLearningOff = () => {},
		onCancelCategoryLearningOff = () => {}
	}: {
		values: ListFeatureValues;
		onToggle: (field: BooleanFeatureField) => void;
		/** Settings-page-only: gates a destructive-action confirm step before
		 *  disabling category learning (turning it off deletes learned data).
		 *  Left at its default on the create page, which has nothing learned yet. */
		confirmingCategoryLearningOff?: boolean;
		onCategoryLearningToggleClick?: () => void;
		onConfirmCategoryLearningOff?: () => void;
		onCancelCategoryLearningOff?: () => void;
	} = $props();
</script>

<div class="flex flex-col gap-2">
	<Toggle
		checked={values.useCategories}
		onchange={() => onToggle('useCategories')}
		class={ROW_CLASS}
	>
		Categories
	</Toggle>

	{#if values.useCategories}
		{#if confirmingCategoryLearningOff}
			<div
				class="ml-4 flex flex-col gap-2 rounded-lg border border-red-200 p-3 dark:border-red-900"
			>
				<p class="text-sm text-red-600 dark:text-red-400">
					Turning this off deletes everything this list has learned about item categories. This
					can't be undone.
				</p>
				<div class="flex gap-2">
					<Button size="sm" color="red" onclick={onConfirmCategoryLearningOff}>
						Confirm turn off
					</Button>
					<Button size="sm" color="alternative" onclick={onCancelCategoryLearningOff}>Cancel</Button
					>
				</div>
			</div>
		{:else}
			<Toggle
				checked={values.useCategoryLearning}
				onchange={onCategoryLearningToggleClick}
				class={SUB_ROW_CLASS}
			>
				Learn item categories
			</Toggle>
		{/if}
	{/if}

	<Toggle checked={values.useShops} onchange={() => onToggle('useShops')} class={ROW_CLASS}
		>Stores</Toggle
	>

	{#if values.useShops}
		<Toggle
			checked={values.showStoreInList}
			onchange={() => onToggle('showStoreInList')}
			class={SUB_ROW_CLASS}
		>
			Show store name in list
		</Toggle>
	{/if}

	<Toggle checked={values.useFavorites} onchange={() => onToggle('useFavorites')} class={ROW_CLASS}>
		Favorites
	</Toggle>

	<Toggle checked={values.useRecent} onchange={() => onToggle('useRecent')} class={ROW_CLASS}>
		Recently deleted
	</Toggle>

	<Toggle checked={values.useQuantity} onchange={() => onToggle('useQuantity')} class={ROW_CLASS}>
		Quantity
	</Toggle>

	<Toggle checked={values.usePrice} onchange={() => onToggle('usePrice')} class={ROW_CLASS}
		>Price</Toggle
	>

	{#if values.usePrice}
		<Toggle
			checked={values.showPriceInList}
			onchange={() => onToggle('showPriceInList')}
			class={SUB_ROW_CLASS}
		>
			Show price in list
		</Toggle>
	{/if}

	<Toggle checked={values.useDeadline} onchange={() => onToggle('useDeadline')} class={ROW_CLASS}>
		Deadlines
	</Toggle>
</div>
