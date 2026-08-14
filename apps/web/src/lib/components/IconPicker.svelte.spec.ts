import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IconPicker from './IconPicker.svelte';

describe('IconPicker.svelte', () => {
	it("exposes the display label as the trigger button's accessible name, without showing it as text", async () => {
		render(IconPicker, { value: 'fruitCherries', onselect: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Fruit Cherries' })).toBeInTheDocument();
		await expect.element(page.getByText('Fruit Cherries')).not.toBeInTheDocument();
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

	it('windows a large match set instead of rendering every result at once', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();
		// "ar" matches hundreds of @mdi/js icons — enough to prove the grid
		// isn't just rendering the full match set into the DOM.
		await page.getByPlaceholder('Search icons…').fill('ar');

		const results = page.getByTestId('icon-picker-results');
		await expect.element(results).toBeInTheDocument();

		const buttonCount = await results.element().querySelectorAll('button').length;
		expect(buttonCount).toBeGreaterThan(0);
		expect(buttonCount).toBeLessThan(100);
	});

	it('reveals more results as the results container is scrolled', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('ar');

		const resultsEl = page.getByTestId('icon-picker-results').element() as HTMLDivElement;
		const namesBeforeScroll = [...resultsEl.querySelectorAll('button')].map((button) =>
			button.getAttribute('title')
		);

		resultsEl.scrollTop = 2000;
		resultsEl.dispatchEvent(new Event('scroll'));
		await expect
			.poll(() =>
				[...resultsEl.querySelectorAll('button')].map((button) => button.getAttribute('title'))
			)
			.not.toEqual(namesBeforeScroll);
	});

	it('does not re-fetch icons when reopened after already loading them once', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();
		await expect.element(page.getByText('Type at least 2 characters…')).toBeInTheDocument();

		// Close and reopen — should show the same "type to search" prompt
		// immediately, without a "Loading icons…" flash the second time.
		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByText('Type at least 2 characters…')).toBeInTheDocument();
	});

	it('resets scroll position when the search term changes', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('ar');

		const resultsEl = page.getByTestId('icon-picker-results').element() as HTMLDivElement;
		resultsEl.scrollTop = 2000;
		resultsEl.dispatchEvent(new Event('scroll'));
		await expect.poll(() => resultsEl.scrollTop).toBeGreaterThan(0);

		await page.getByPlaceholder('Search icons…').fill('are');
		await expect.poll(() => resultsEl.scrollTop).toBe(0);
	});
});
