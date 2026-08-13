import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({
	fetchCategories: vi.fn(),
	createCategory: vi.fn(),
	updateCategory: vi.fn(),
	deleteCategory: vi.fn(),
	reorderCategories: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories, createCategory, deleteCategory, reorderCategories } =
	await import('$lib/api/categories');
const { goto } = await import('$app/navigation');
const CategoriesPage = (await import('./+page.svelte')).default;

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
const custom = {
	id: 11,
	listId: 1,
	name: 'Pet Supplies',
	icon: 'paw',
	sortOrder: 1,
	isDefault: false,
	createdAt: TS,
	updatedAt: null
};

describe('Categories +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce, custom]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(CategoriesPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);

		await expect.element(page.getByText('Failed to load categories.')).toBeInTheDocument();
	});

	it('only shows Delete for list-scoped categories, not global defaults', async () => {
		render(CategoriesPage);

		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();
		const deleteButtons = page.getByRole('button', { name: 'Delete' });
		await expect.element(deleteButtons).toBeInTheDocument();
		await expect.poll(async () => (await deleteButtons.all()).length).toBe(1);
	});

	it('creates a new category from the form', async () => {
		vi.mocked(createCategory).mockResolvedValue({
			id: 12,
			listId: 1,
			name: 'Snacks',
			icon: 'cookie',
			sortOrder: 2,
			isDefault: false,
			createdAt: TS,
			updatedAt: null
		});

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByPlaceholder('New category name').fill('Snacks');
		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('cookie');
		await page.getByRole('button', { name: 'Cookie', exact: true }).click();
		await page.getByRole('button', { name: 'Add' }).click();

		expect(createCategory).toHaveBeenCalledWith(1, { name: 'Snacks', icon: 'cookie' });
		await expect
			.poll(async () => (await page.getByRole('button', { name: 'Save' }).all()).length)
			.toBe(3);
	});

	it('deletes a list-scoped category', async () => {
		vi.mocked(deleteCategory).mockResolvedValue(undefined);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		expect(deleteCategory).toHaveBeenCalledWith(1, 11);
	});

	it('reorders categories by moving the second one up', async () => {
		vi.mocked(reorderCategories).mockResolvedValue([custom, produce]);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		const upButtons = page.getByRole('button', { name: 'Move up' });
		await upButtons.nth(1).click();

		expect(reorderCategories).toHaveBeenCalledWith(1, [11, 10]);
	});
});
