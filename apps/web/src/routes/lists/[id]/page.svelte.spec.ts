import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto, SyncEventDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({
	fetchList: vi.fn(),
	updateList: vi.fn(),
	deleteList: vi.fn(),
	emailExportList: vi.fn()
}));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/items', () => ({
	fetchItems: vi.fn(),
	fetchRecentItems: vi.fn(),
	createItem: vi.fn(),
	deleteItem: vi.fn(),
	importItems: vi.fn(),
	restoreItem: vi.fn(),
	updateItem: vi.fn()
}));
vi.mock('$lib/api/stores', () => ({ fetchStoreCategoryOrder: vi.fn(), fetchStores: vi.fn() }));
vi.mock('$lib/api/selected-store', () => ({
	getSelectedStore: vi.fn(),
	setSelectedStore: vi.fn()
}));
vi.mock('$lib/realtime', () => ({ subscribeToList: vi.fn(() => vi.fn()) }));
vi.mock('$lib/pwa/badge', () => ({ refreshBadgeCount: vi.fn() }));

const { fetchList, updateList, deleteList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const {
	fetchItems,
	fetchRecentItems,
	createItem,
	deleteItem,
	updateItem,
	importItems,
	restoreItem
} = await import('$lib/api/items');
const { fetchStoreCategoryOrder, fetchStores } = await import('$lib/api/stores');
const { getSelectedStore } = await import('$lib/api/selected-store');
const { subscribeToList } = await import('$lib/realtime');
const { refreshBadgeCount } = await import('$lib/pwa/badge');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { goto } = await import('$app/navigation');
const ListDetailPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const list = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
	ownerId: 1,
	folderId: null,
	badgeExcluded: false,
	passcodeHash: null,
	archived: false,
	itemCount: 0,
	createdAt: TS,
	updatedAt: null,
	version: 1
};
const produce = {
	id: 10,
	listId: null,
	name: 'Produce',
	icon: 'apple',
	sortOrder: 0,
	isDefault: true,
	createdAt: TS,
	updatedAt: null,
	deletedAt: null,
	version: 1
};
const dairy = {
	id: 11,
	listId: null,
	name: 'Dairy',
	icon: 'milk',
	sortOrder: 1,
	isDefault: true,
	createdAt: TS,
	updatedAt: null,
	deletedAt: null,
	version: 1
};

function makeItem(overrides: Partial<ItemDto> & Pick<ItemDto, 'id' | 'name'>): ItemDto {
	return {
		listId: 1,
		quantity: null,
		notes: null,
		categoryId: null,
		storeId: null,
		price: null,
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
		version: 1,
		...overrides
	};
}

describe('List detail +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(fetchRecentItems).mockResolvedValue([]);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(getSelectedStore).mockResolvedValue(null);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(async () => {
		vi.clearAllMocks();
		clearToken();
		window.sessionStorage.clear();
		await resetDbForTesting();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(ListDetailPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);

		await expect.element(page.getByText('Failed to load list.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(ListDetailPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('applies the store-specific category order when a store is selected', async () => {
		vi.mocked(getSelectedStore).mockResolvedValue(7);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 7, categoryId: 10, sortOrder: 5, deletedAt: null, version: 1 },
			{ id: 2, storeId: 7, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 }
		]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		expect(fetchStoreCategoryOrder).toHaveBeenCalledWith(7);

		// Dairy (sortOrder override 0) should now be ordered before Produce
		// (sortOrder override 5), the reverse of their default sortOrder.
		const headings = document.querySelectorAll('h2');
		const headingTexts = [...headings].map((h) => h.textContent?.trim());
		const dairyIndex = headingTexts.findIndex((t) => t === 'Dairy');
		const produceIndex = headingTexts.findIndex((t) => t === 'Produce');
		expect(dairyIndex).toBeGreaterThanOrEqual(0);
		expect(produceIndex).toBeGreaterThan(dairyIndex);
	});

	it('groups items with no category under "Uncategorized"', async () => {
		vi.mocked(fetchItems).mockResolvedValue([makeItem({ id: 100, name: 'Mystery item' })]);

		render(ListDetailPage);

		await expect.element(page.getByText('Mystery item')).toBeInTheDocument();
		await expect.element(page.getByText('Uncategorized')).toBeInTheDocument();
	});

	it('groups items by category and lists checked items separately', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', quantity: '2', categoryId: 10 }),
			makeItem({
				id: 101,
				name: 'Milk',
				categoryId: 11,
				checked: true,
				checkedAt: '2026-08-13T00:00:00.000Z',
				sortOrder: 1
			})
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Checked')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		const produceHeader = page.getByText('Produce').element().closest('h2');
		expect(produceHeader).not.toBeNull();
		expect(produceHeader?.style.color).toBe('rgb(59, 130, 246)');

		// Neither item has a price set, so the progress strip's total is hidden.
		await expect.element(page.getByText('1 of 2 done')).toBeInTheDocument();
		await expect.element(page.getByText(/^Total:/)).not.toBeInTheDocument();
	});

	it('adds a new item with a quantity via the form', async () => {
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread', quantity: '2' }));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByPlaceholder('Qty').fill('2');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		expect(createItem).toHaveBeenCalledWith(1, { name: 'Bread', quantity: '2' });
	});

	it('keeps an existing item’s store tag select stable when a new item is added', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 })
		]);
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread', categoryId: 10 }));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('does not submit when the new item name is only whitespace', async () => {
		// The Add button is already disabled in this state, but handleAddItem
		// carries its own guard, reachable via a raw 'submit' event and not
		// just a click on the (disabled) button.
		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const input = page.getByPlaceholder('Item name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createItem).mock.calls.length).toBe(0);
	});

	it('shows a generic error message when adding an item fails without an ApiError', async () => {
		vi.mocked(createItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Failed to add item.')).toBeInTheDocument();
	});

	it('shows the ApiError message when adding an item fails', async () => {
		vi.mocked(createItem).mockRejectedValue(new ApiError(422, 'Duplicate item'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Duplicate item')).toBeInTheDocument();
	});

	it('opens and closes the paste-import form', async () => {
		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await expect
			.element(page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel paste import' }).click();
		await expect
			.element(page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs'))
			.not.toBeInTheDocument();
	});

	it('imports items pasted into the textarea', async () => {
		vi.mocked(importItems).mockResolvedValue([
			makeItem({ id: 400, name: 'Milk' }),
			makeItem({ id: 401, name: 'Bread' })
		]);

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs').fill('Milk\nBread');
		await page.getByRole('button', { name: 'Import items' }).click();

		expect(importItems).toHaveBeenCalledWith(1, 'Milk\nBread');
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect
			.element(page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs'))
			.not.toBeInTheDocument();
	});

	it('does not import when the pasted text is only whitespace', async () => {
		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		const textarea = page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs');
		await textarea.fill('   ');
		textarea
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(importItems).mock.calls.length).toBe(0);
	});

	it('shows a generic error message when importing fails without an ApiError', async () => {
		vi.mocked(importItems).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs').fill('Milk');
		await page.getByRole('button', { name: 'Import items' }).click();

		await expect.element(page.getByText('Failed to import items.')).toBeInTheDocument();
	});

	it('shows the ApiError message when importing fails', async () => {
		vi.mocked(importItems).mockRejectedValue(new ApiError(422, 'Could not parse items'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs').fill('Milk');
		await page.getByRole('button', { name: 'Import items' }).click();

		await expect.element(page.getByText('Could not parse items')).toBeInTheDocument();
	});

	it('toggles one item checked without affecting a sibling item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('0 of 2 done')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: true });
		await expect.element(page.getByText('Checked')).toBeInTheDocument();
		await expect.element(page.getByText('1 of 2 done')).toBeInTheDocument();
		// Bread stays unchecked (and thus still in the main list) — proves the
		// map only updates the toggled item, not every item.
		await expect.element(page.getByRole('checkbox', { name: 'Bread' })).not.toBeChecked();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('unchecks a checked item from the "Checked" section', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Checked')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: false });
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Checked')).not.toBeInTheDocument();
	});

	it('filters items down to the selected store', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await page.getByRole('combobox').first().selectOptions('20');

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Close' }).first().click();

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
	});

	it('tags an item with a store via its per-item select', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: null }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await page.getByRole('combobox').nth(1).selectOptions('20');

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, { storeId: 20 });
	});

	it('reloads the list when tagging a store fails without an ApiError', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: null })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('combobox').last().selectOptions('20');

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('clears an item store tag back to null via its per-item select', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Close' }).last().click();

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, { storeId: null });
	});

	it('reloads the list when tagging a store fails', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: null })
		]);
		vi.mocked(updateItem).mockRejectedValue(new ApiError(500, 'Could not tag store'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('combobox').last().selectOptions('20');

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('sets an item price via its per-item input, leaving a sibling item untouched, and shows the running total', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, price: 250 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('Price').first().fill('3.99');
		await page.getByText('Groceries').click();

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, { price: 399 });
		await expect.element(page.getByText('Total: $6.49')).toBeInTheDocument();

		// Toggling a checkbox reassigns `items` without touching any price, so
		// the running total recomputes to the same value it already displayed.
		await page.getByRole('checkbox', { name: 'Bread' }).click();
		await expect.element(page.getByText('Total: $6.49')).toBeInTheDocument();
	});

	it('reloads the list when setting a price fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new ApiError(500, 'Could not set price'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('Price').fill('3.99');
		await page.getByText('Groceries').click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('clears an item price back to null via its per-item input', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, price: 399 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Total: $3.99')).toBeInTheDocument();

		await page.getByPlaceholder('Price').clear();
		await page.getByText('Groceries').click();

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, { price: null });
	});

	it('ignores a non-numeric price entry', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('Price').fill('abc');
		await page.getByText('Groceries').click();

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(0);
	});

	it('reloads the list when setting a price fails without an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('Price').fill('3.99');
		await page.getByText('Groceries').click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('reloads the list when toggling checked fails without an ApiError', async () => {
		// toggleChecked's catch sets `error` and immediately triggers a reload
		// via loadAll(), which flips `loading` back to true in the same tick —
		// the page collapses to its "Loading…" state before the error message
		// ever paints, so what's observable here is the reload itself.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('checkbox').click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('reloads the list when toggling checked fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new ApiError(500, 'Could not update'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('checkbox').click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('removes a checked item from the "Checked" section', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Checked')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	it('removes an item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	it('prepends a removed item to the recently-deleted list when it is open', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Nothing recently deleted.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.element(page.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
	});

	it('reloads the list when removing an item fails without an ApiError', async () => {
		// removeItem's catch, like toggleChecked's, sets `error` and then
		// reloads — the reload's `loading = true` collapses the page before
		// the message paints, so the observable effect is the reload itself.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(deleteItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('reloads the list when removing an item fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(deleteItem).mockRejectedValue(new ApiError(500, 'Could not delete'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('shows a generic error message when loading recently deleted items fails without an ApiError', async () => {
		vi.mocked(fetchRecentItems).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();

		await expect
			.element(page.getByText('Failed to load recently deleted items.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when loading recently deleted items fails', async () => {
		vi.mocked(fetchRecentItems).mockRejectedValue(new ApiError(500, 'Could not load recent'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();

		await expect.element(page.getByText('Could not load recent')).toBeInTheDocument();
	});

	it('hides the recently-deleted panel again on a second click', async () => {
		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Nothing recently deleted.')).toBeInTheDocument();
		expect(fetchRecentItems).toHaveBeenCalledTimes(1);

		await page.getByRole('button', { name: 'Hide recently deleted' }).click();
		await expect.element(page.getByText('Nothing recently deleted.')).not.toBeInTheDocument();
		// Closing again shouldn't re-trigger a load.
		expect(fetchRecentItems).toHaveBeenCalledTimes(1);
	});

	it('shows a generic error message when restoring an item fails without an ApiError', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([
			makeItem({ id: 300, name: 'Eggs', deletedAt: '2026-08-12T00:00:00.000Z' })
		]);
		vi.mocked(restoreItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		await expect.element(page.getByText('Failed to restore item.')).toBeInTheDocument();
		await expect.poll(() => vi.mocked(fetchRecentItems).mock.calls.length).toBe(2);
	});

	it('shows the ApiError message when restoring an item fails', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([
			makeItem({ id: 300, name: 'Eggs', deletedAt: '2026-08-12T00:00:00.000Z' })
		]);
		vi.mocked(restoreItem).mockRejectedValue(new ApiError(500, 'Could not restore'));

		render(ListDetailPage);

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		await expect.element(page.getByText('Could not restore')).toBeInTheDocument();
	});

	it('shows recently deleted items and restores one', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([
			makeItem({ id: 300, name: 'Eggs', deletedAt: '2026-08-12T00:00:00.000Z' })
		]);
		vi.mocked(restoreItem).mockResolvedValue(makeItem({ id: 300, name: 'Eggs', sortOrder: 2 }));

		render(ListDetailPage);

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();
		expect(restoreItem).toHaveBeenCalledWith(1, 300);
	});

	it('subscribes to the list channel and shows a toast on a sync event, refreshing on click', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		const unsubscribe = vi.fn();
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return unsubscribe;
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
		expect(subscribeToList).toHaveBeenCalledWith(1, expect.any(Function));

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null, version: 1 });
		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
		expect(fetchList).toHaveBeenCalledTimes(2);
	});

	it('suppresses the sync toast for a row with an unacked local edit', async () => {
		const db = getDb()!;
		await db.items.put({
			...makeItem({ id: 1, name: 'Milk' }),
			_dirty: true
		});
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ entityType: 'item', entityId: 1, op: 'update', payload: null, version: 2 });
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
	});

	it('opens the list settings menu with links scoped to this list', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();

		const categories = page.getByRole('link', { name: 'Categories' });
		await expect.element(categories).toBeInTheDocument();
		expect(categories.element().getAttribute('href')).toBe('/lists/1/categories');

		const members = page.getByRole('link', { name: 'Members' });
		expect(members.element().getAttribute('href')).toBe('/lists/1/members');
	});

	it('archives the list from the settings menu', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, archived: true });

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Archive list' }).click();

		expect(updateList).toHaveBeenCalledWith(1, { archived: true });
		await expect.element(page.getByRole('button', { name: 'Unarchive list' })).toBeInTheDocument();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('excludes the list from the badge count via the settings menu', async () => {
		vi.mocked(updateList).mockResolvedValue({ ...list, badgeExcluded: true });

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Exclude from badge count' }).click();

		expect(updateList).toHaveBeenCalledWith(1, { badgeExcluded: true });
		await expect
			.element(page.getByRole('button', { name: 'Include in badge count' }))
			.toBeInTheDocument();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('shows an error when updating the list fails', async () => {
		vi.mocked(updateList).mockRejectedValue(new ApiError(500, 'Could not update list'));

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Archive list' }).click();

		await expect.element(page.getByText('Could not update list')).toBeInTheDocument();
	});

	it('shows a generic error message when updating the list fails without an ApiError', async () => {
		vi.mocked(updateList).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Archive list' }).click();

		await expect.element(page.getByText('Failed to update list.')).toBeInTheDocument();
	});

	it('deletes the list after confirming, then navigates back to the list index', async () => {
		vi.mocked(deleteList).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		expect(deleteList).toHaveBeenCalledWith(1);
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists');
	});

	it('shows an error when deleting the list fails', async () => {
		vi.mocked(deleteList).mockRejectedValue(new ApiError(500, 'Could not delete list'));

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('Could not delete list')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('shows a generic error message when deleting the list fails without an ApiError', async () => {
		vi.mocked(deleteList).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List settings' }).click();
		await page.getByRole('button', { name: 'Delete list' }).click();
		await page.getByRole('button', { name: 'Confirm delete' }).click();

		await expect.element(page.getByText('Failed to delete list.')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('dismisses the sync toast without refreshing', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null, version: 1 });
		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
		expect(fetchList).toHaveBeenCalledTimes(1);
	});

	it('shows the passcode gate instead of the list body for a locked, unopened list', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash: 'abc:def' });

		render(ListDetailPage);

		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.not.toBeInTheDocument();
		// The header/menu stay reachable even while locked (recovery path).
		await expect.element(page.getByRole('button', { name: 'List settings' })).toBeInTheDocument();
	});

	it('reveals the list body once the correct passcode is entered', async () => {
		const { buildPasscodeHash } = await import('$lib/passcode');
		const passcodeHash = await buildPasscodeHash('1234');
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash });

		render(ListDetailPage);
		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();

		await page.getByLabelText('Passcode').fill('1234');
		await page.getByRole('button', { name: 'Unlock' }).click();

		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	it('skips the passcode gate on a later visit within the same session', async () => {
		const { unlockList } = await import('$lib/passcode');
		unlockList(1);
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash: 'abc:def' });

		render(ListDetailPage);

		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
		await expect.element(page.getByText('This list is locked')).not.toBeInTheDocument();
	});
});
