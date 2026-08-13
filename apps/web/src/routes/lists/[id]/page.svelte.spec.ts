import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
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
vi.mock('$lib/api/stores', () => ({ fetchStoreCategoryOrder: vi.fn() }));
vi.mock('$lib/api/selected-store', () => ({
	getSelectedStore: vi.fn(),
	setSelectedStore: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchItems, fetchRecentItems, createItem, restoreItem } = await import('$lib/api/items');
const { fetchStoreCategoryOrder } = await import('$lib/api/stores');
const { getSelectedStore } = await import('$lib/api/selected-store');
const { goto } = await import('$app/navigation');
const ListDetailPage = (await import('./+page.svelte')).default;

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

function makeItem(overrides: Partial<ItemDto> & Pick<ItemDto, 'id' | 'name'>): ItemDto {
	return {
		listId: 1,
		quantity: null,
		notes: null,
		categoryId: null,
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
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
		vi.mocked(getSelectedStore).mockReturnValue(null);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
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
	});

	it('adds a new item via the form', async () => {
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread' }));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		expect(createItem).toHaveBeenCalledWith(1, { name: 'Bread', quantity: null });
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
});
