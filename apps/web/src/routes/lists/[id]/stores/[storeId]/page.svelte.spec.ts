import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$app/state', () => ({ page: { params: { id: '1', storeId: '20' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/stores', () => ({
	fetchStores: vi.fn(),
	fetchStoreCategoryOrder: vi.fn(),
	reorderStoreCategories: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchStores, fetchStoreCategoryOrder, reorderStoreCategories } =
	await import('$lib/api/stores');
const { goto } = await import('$app/navigation');
const StoreOrderPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const list = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
	ownerId: 1,
	archived: false,
	createdAt: TS,
	updatedAt: null
};
const walmart = {
	id: 20,
	name: 'Walmart',
	color: '#3b82f6',
	createdBy: 1,
	createdAt: TS,
	updatedAt: null
};
const produce = {
	id: 10,
	listId: null,
	name: 'Produce',
	icon: 'apple',
	sortOrder: 0,
	isDefault: true,
	createdAt: TS,
	updatedAt: null
};
const dairy = {
	id: 11,
	listId: null,
	name: 'Dairy',
	icon: 'milk',
	sortOrder: 1,
	isDefault: true,
	createdAt: TS,
	updatedAt: null
};

describe('Store aisle order +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchStores).mockResolvedValue([walmart]);
		vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(StoreOrderPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(StoreOrderPage);

		await expect
			.element(page.getByText('Failed to load store category order.'))
			.toBeInTheDocument();
	});

	it('renders categories in default order under the store name', async () => {
		render(StoreOrderPage);

		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await expect.element(page.getByText('Dairy')).toBeInTheDocument();
	});

	it('moves a category down and persists the new order', async () => {
		vi.mocked(reorderStoreCategories).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 11, sortOrder: 0 },
			{ id: 2, storeId: 20, categoryId: 10, sortOrder: 1 }
		]);

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Move down' }).first().click();

		expect(reorderStoreCategories).toHaveBeenCalledWith(20, [
			{ categoryId: 11, sortOrder: 0 },
			{ categoryId: 10, sortOrder: 1 }
		]);
	});
});
