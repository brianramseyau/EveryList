import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IconPicker from './IconPicker.svelte';

describe('IconPicker.svelte', () => {
	it('shows the current icon and its display label on the trigger button', async () => {
		render(IconPicker, { value: 'fruitCherries', onselect: vi.fn() });

		await expect.element(page.getByText('Fruit Cherries')).toBeInTheDocument();
	});

	it('prompts to search before showing any results', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByText('Type at least 2 characters…')).toBeInTheDocument();
	});

	it('filters icons by search and calls onselect with the stored name', async () => {
		const onselect = vi.fn();
		render(IconPicker, { value: 'tag', onselect });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('cherries');
		await page.getByRole('button', { name: 'Fruit Cherries', exact: true }).click();

		expect(onselect).toHaveBeenCalledWith('fruitCherries');
	});

	it('shows a no-match message for a search with no results', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('zzzznotarealicon');

		await expect.element(page.getByText('No icons match "zzzznotarealicon".')).toBeInTheDocument();
	});
});
