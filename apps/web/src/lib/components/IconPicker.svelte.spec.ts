import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IconPicker from './IconPicker.svelte';

describe('IconPicker.svelte', () => {
	// Picking an icon records a real favorite via $lib/icons/favorites.ts's
	// localStorage (see the "remembers a picked icon" test below), and the
	// whole client project shares one browser/localStorage — other route
	// specs that save a category/list through this same picker do too.
	// Clear before *and* after each test so neither this suite's "default
	// suggestions" tests nor another file's are at the mercy of run order.
	beforeEach(() => {
		window.localStorage.removeItem('everylist:iconFavorites');
	});

	afterEach(() => {
		window.localStorage.removeItem('everylist:iconFavorites');
	});

	it("exposes the display label as the trigger button's accessible name, without showing it as text", async () => {
		render(IconPicker, { value: 'fruitCherries', onselect: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Fruit Cherries' })).toBeInTheDocument();
		await expect.element(page.getByText('Fruit Cherries')).not.toBeInTheDocument();
	});

	it('shows a default set of shopping-related icons before any search', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByText('Popular icons')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Cart', exact: true }))
			.toBeInTheDocument();
	});

	it('focuses the search input as soon as the picker opens', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByPlaceholder('Search icons…')).toHaveFocus();
	});

	it('seeds the default icons from a category-name hint, labeling them as such', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn(), hint: 'Dairy' });

		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByText('Suggested for "Dairy"')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Cheese', exact: true }))
			.toBeInTheDocument();
	});

	it('falls back to "Popular icons" when the hint matches nothing', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn(), hint: 'Xyzzy' });

		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByText('Popular icons')).toBeInTheDocument();
	});

	it('filters icons by search and calls onselect with the stored name', async () => {
		const onselect = vi.fn();
		render(IconPicker, { value: 'tag', onselect });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('cherries');
		await page.getByRole('button', { name: 'Fruit Cherries', exact: true }).click();

		expect(onselect).toHaveBeenCalledWith('fruitCherries');
	});

	it('finds an icon via an aliased search term its own name never mentions', async () => {
		const onselect = vi.fn();
		render(IconPicker, { value: 'tag', onselect });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('milk');
		await page.getByRole('button', { name: 'Cup', exact: true }).click();

		expect(onselect).toHaveBeenCalledWith('cup');
	});

	it('remembers a picked icon and backfills it into suggestions on reopen', async () => {
		render(IconPicker, { value: 'tag', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('cheese');
		await page.getByRole('button', { name: 'Cheese', exact: true }).click();

		// Reopen (closed automatically on pick, and `value` isn't rebound by
		// this test's onselect, so the trigger's label is still "Tag") with
		// no search and no hint.
		await page.getByRole('button', { name: 'Tag' }).click();

		await expect
			.element(page.getByRole('button', { name: 'Cheese', exact: true }))
			.toBeInTheDocument();
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
		await expect.element(page.getByText('Popular icons')).toBeInTheDocument();

		// Close and reopen — should show the default icons immediately,
		// without a "Loading icons…" flash the second time.
		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByRole('button', { name: 'Tag' }).click();

		await expect.element(page.getByText('Popular icons')).toBeInTheDocument();
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
