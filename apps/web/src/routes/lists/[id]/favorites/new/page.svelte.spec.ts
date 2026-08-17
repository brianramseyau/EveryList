import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryDto, ListDto, StoreDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '5' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ fetchStores: vi.fn() }));
vi.mock('$lib/api/favorites', () => ({ createFavorite: vi.fn() }));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchStores } = await import('$lib/api/stores');
const { createFavorite } = await import('$lib/api/favorites');
const { goto } = await import('$app/navigation');
const NewFavoritePage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const list: ListDto = {
	id: 5,
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

describe('New Favorite +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(NewFavoritePage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('disables Save until a name is entered', async () => {
		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByLabelText('Name').fill('Bread');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('does not submit when the name is only whitespace', async () => {
		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		const input = page.getByLabelText('Name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(createFavorite).not.toHaveBeenCalled();
	});

	it('creates a favorite with all fields, then navigates to the favorites list', async () => {
		vi.mocked(fetchStores).mockResolvedValue([corner]);
		vi.mocked(createFavorite).mockResolvedValue({
			id: 2,
			userId: 1,
			listId: 5,
			name: 'Bread',
			defaultCategoryId: 10,
			defaultQuantity: '1 loaf',
			storeId: 20,
			notes: 'Whole wheat',
			price: 350,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await page.getByLabelText('Name').fill('Bread');
		await page.getByLabelText('Quantity (optional)').fill('1 loaf');
		await page.getByLabelText('Price (optional)').fill('3.50');
		await page.getByLabelText('Category').selectOptions('10');
		await page.getByLabelText('Store').selectOptions('20');
		await page.getByLabelText('Notes (optional)').fill('Whole wheat');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createFavorite).toHaveBeenCalledWith(5, {
			name: 'Bread',
			defaultQuantity: '1 loaf',
			notes: 'Whole wheat',
			price: 350,
			defaultCategoryId: 10,
			storeId: 20
		});
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/5/favorites');
	});

	it('clears quantity, price, and notes to null when left empty', async () => {
		vi.mocked(createFavorite).mockResolvedValue({
			id: 2,
			userId: 1,
			listId: 5,
			name: 'Bread',
			defaultCategoryId: null,
			defaultQuantity: null,
			storeId: null,
			notes: null,
			price: null,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await page.getByLabelText('Name').fill('Bread');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createFavorite).toHaveBeenCalledWith(5, {
			name: 'Bread',
			defaultQuantity: null,
			notes: null,
			price: null,
			defaultCategoryId: null,
			storeId: null
		});
	});

	it('ignores a non-numeric price entry', async () => {
		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await page.getByLabelText('Name').fill('Bread');
		await page.getByLabelText('Price (optional)').fill('abc');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createFavorite).not.toHaveBeenCalled();
	});

	it('hides the Category field when the list opts out of categories', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });

		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await expect.element(page.getByLabelText('Category')).not.toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(NewFavoritePage);

		await expect.element(page.getByText('Failed to load favorite.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(NewFavoritePage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('shows a generic error message when saving fails without an ApiError', async () => {
		vi.mocked(createFavorite).mockRejectedValue(new TypeError('network down'));

		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await page.getByLabelText('Name').fill('Bread');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to create favorite.')).toBeInTheDocument();
	});

	it('shows the ApiError message when saving fails', async () => {
		vi.mocked(createFavorite).mockRejectedValue(new ApiError(409, 'Favorite already exists'));

		render(NewFavoritePage);
		await expect.element(page.getByLabelText('Name')).toBeInTheDocument();

		await page.getByLabelText('Name').fill('Bread');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Favorite already exists')).toBeInTheDocument();
	});
});
