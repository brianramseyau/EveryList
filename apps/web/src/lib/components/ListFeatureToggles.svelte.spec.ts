import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_FEATURE_VALUES } from '$lib/list-prefabs';
import ListFeatureToggles from './ListFeatureToggles.svelte';

describe('ListFeatureToggles.svelte', () => {
	it('renders every feature toggle, checked per the given values', async () => {
		render(ListFeatureToggles, { values: DEFAULT_FEATURE_VALUES, onToggle: vi.fn() });

		await expect
			.element(page.getByRole('checkbox', { name: 'Categories', exact: true }))
			.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Stores' })).toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Favorites' })).toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Recently deleted' })).toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Quantity' })).toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Price', exact: true })).toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Deadlines' })).not.toBeChecked();
	});

	it('calls onToggle with the field name when a top-level toggle is clicked', async () => {
		const onToggle = vi.fn();
		render(ListFeatureToggles, { values: DEFAULT_FEATURE_VALUES, onToggle });

		await page.getByRole('checkbox', { name: 'Stores' }).click();

		expect(onToggle).toHaveBeenCalledWith('useShops');
	});

	it('hides the nested sub-toggles when their parent feature is off', async () => {
		render(ListFeatureToggles, {
			values: { ...DEFAULT_FEATURE_VALUES, useShops: false, usePrice: false },
			onToggle: vi.fn()
		});

		await expect
			.element(page.getByRole('checkbox', { name: 'Show store name in list' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('checkbox', { name: 'Show price in list' }))
			.not.toBeInTheDocument();
	});

	it('calls onToggle directly for category learning when no custom click handler is given', async () => {
		const onToggle = vi.fn();
		render(ListFeatureToggles, { values: DEFAULT_FEATURE_VALUES, onToggle });

		await page.getByRole('checkbox', { name: 'Learn item categories' }).click();

		expect(onToggle).toHaveBeenCalledWith('useCategoryLearning');
	});

	it('defaults confirm/cancel on the confirm-off panel to no-ops when unset', async () => {
		render(ListFeatureToggles, {
			values: DEFAULT_FEATURE_VALUES,
			onToggle: vi.fn(),
			confirmingCategoryLearningOff: true
		});

		await page.getByRole('button', { name: 'Confirm turn off' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('shows the confirm-off panel in place of the toggle, wiring confirm and cancel', async () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		render(ListFeatureToggles, {
			values: DEFAULT_FEATURE_VALUES,
			onToggle: vi.fn(),
			confirmingCategoryLearningOff: true,
			onConfirmCategoryLearningOff: onConfirm,
			onCancelCategoryLearningOff: onCancel
		});

		await expect
			.element(page.getByRole('checkbox', { name: 'Learn item categories' }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Confirm turn off' }).click();
		expect(onConfirm).toHaveBeenCalled();

		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(onCancel).toHaveBeenCalled();
	});
});
