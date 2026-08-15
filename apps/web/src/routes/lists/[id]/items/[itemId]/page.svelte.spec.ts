import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryDto, ItemDto, StoreDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1', itemId: '100' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchItems: vi.fn(), updateItem: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ fetchStores: vi.fn() }));
vi.mock('$lib/offline/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/offline/db')>();
	return { ...actual, getDb: vi.fn(actual.getDb) };
});

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchItems, updateItem } = await import('$lib/api/items');
const { fetchStores } = await import('$lib/api/stores');
const { goto } = await import('$app/navigation');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const ItemDetailPage = (await import('./+page.svelte')).default;

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

const produce: CategoryDto = {
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

const corner: StoreDto = {
	id: 20,
	name: 'Corner Shop',
	color: '#3b82f6',
	createdBy: 1,
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

describe('Item detail +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(async () => {
		vi.clearAllMocks();
		clearToken();
		await resetDbForTesting();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(ItemDetailPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('reads the item from the offline cache when present, without a network fetch', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas', quantity: '2' }));

		render(ItemDetailPage);

		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');
		expect(fetchItems).not.toHaveBeenCalled();
	});

	it('falls back to fetching the full item list when the item is not cached', async () => {
		vi.mocked(fetchItems).mockResolvedValue([makeItem({ id: 100, name: 'Bananas' })]);

		render(ItemDetailPage);

		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');
		expect(fetchItems).toHaveBeenCalledWith(1);
	});

	it('falls back to fetching the full item list when no offline database is available', async () => {
		vi.mocked(getDb).mockReturnValueOnce(null);
		vi.mocked(fetchItems).mockResolvedValue([makeItem({ id: 100, name: 'Bananas' })]);

		render(ItemDetailPage);

		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');
		expect(fetchItems).toHaveBeenCalledWith(1);
	});

	it('shows "Item not found." when the item exists in neither the cache nor the list', async () => {
		vi.mocked(fetchItems).mockResolvedValue([]);

		render(ItemDetailPage);

		await expect.element(page.getByText('Item not found.')).toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(ItemDetailPage);

		await expect.element(page.getByText('Failed to load item.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(ItemDetailPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('pre-fills quantity, price, category, store, and notes from the loaded item', async () => {
		const db = getDb()!;
		await db.items.put(
			makeItem({
				id: 100,
				name: 'Bananas',
				quantity: '2',
				price: 399,
				categoryId: 10,
				storeId: 20,
				notes: 'Organic if available'
			})
		);
		vi.mocked(fetchStores).mockResolvedValue([corner]);

		render(ItemDetailPage);

		await expect.element(page.getByLabelText('Quantity (optional)')).toHaveValue('2');
		await expect.element(page.getByLabelText('Price (optional)')).toHaveValue('3.99');
		await expect
			.element(page.getByLabelText('Notes (optional)'))
			.toHaveValue('Organic if available');
	});

	it('saves all fields via a single updateItem call, then navigates back to the list', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));
		vi.mocked(fetchStores).mockResolvedValue([corner]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Name').fill('Ripe Bananas');
		await page.getByLabelText('Quantity (optional)').fill('3');
		await page.getByLabelText('Price (optional)').fill('4.50');
		await page.getByLabelText('Notes (optional)').fill('Yellow, not green');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, {
			name: 'Ripe Bananas',
			quantity: '3',
			notes: 'Yellow, not green',
			price: 450,
			categoryId: null,
			storeId: null
		});
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/1');
	});

	it('clears quantity, price, and notes back to null when submitted empty', async () => {
		const db = getDb()!;
		await db.items.put(
			makeItem({ id: 100, name: 'Bananas', quantity: '2', price: 399, notes: 'old note' })
		);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Quantity (optional)')).toHaveValue('2');

		await page.getByLabelText('Quantity (optional)').clear();
		await page.getByLabelText('Price (optional)').clear();
		await page.getByLabelText('Notes (optional)').clear();
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, {
			name: 'Bananas',
			quantity: null,
			notes: null,
			price: null,
			categoryId: null,
			storeId: null
		});
	});

	it('saves via the form submit event, not just the header Save button', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		const nameInput = page.getByLabelText('Name');
		await expect.element(nameInput).toHaveValue('Bananas');

		nameInput
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
	});

	it('does not save when the name is cleared to only whitespace', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Name').fill('   ');
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		// The Save button is disabled in this state, but save() carries its own
		// guard, reachable via a raw 'submit' event and not just a click.
		const form = page.getByLabelText('Name').element().closest('form');
		form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(updateItem).not.toHaveBeenCalled();
	});

	it('ignores a non-numeric price entry', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Price (optional)').fill('abc');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).not.toHaveBeenCalled();
	});

	it('picks a category via the select', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Category').selectOptions('10');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: 10 }));
	});

	it('clears the category selection back to uncategorized', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas', categoryId: 10 }));
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Category')).toHaveValue('10');

		await page.getByRole('button', { name: 'Close' }).first().click();
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: null }));
	});

	it('picks a store via the select', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));
		vi.mocked(fetchStores).mockResolvedValue([corner]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Store').selectOptions('20');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ storeId: 20 }));
	});

	it('clears the store selection back to no store', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas', storeId: 20 }));
		vi.mocked(fetchStores).mockResolvedValue([corner]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Store')).toHaveValue('20');

		await page.getByRole('button', { name: 'Close' }).last().click();
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ storeId: null }));
	});

	it('shows a generic error message when saving fails without an ApiError', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to save item.')).toBeInTheDocument();
	});

	it('shows the ApiError message when saving fails', async () => {
		const db = getDb()!;
		await db.items.put(makeItem({ id: 100, name: 'Bananas' }));
		vi.mocked(updateItem).mockRejectedValue(new ApiError(409, 'Item was changed elsewhere'));

		render(ItemDetailPage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Item was changed elsewhere')).toBeInTheDocument();
	});
});
