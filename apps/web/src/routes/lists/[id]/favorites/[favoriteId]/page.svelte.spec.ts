import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryDto, FavoriteItemDto, ListDto, StoreDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '5', favoriteId: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ fetchStores: vi.fn() }));
vi.mock('$lib/api/favorites', () => ({ fetchFavorites: vi.fn(), updateFavorite: vi.fn() }));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchStores } = await import('$lib/api/stores');
const { fetchFavorites, updateFavorite } = await import('$lib/api/favorites');
const { goto } = await import('$app/navigation');
const EditFavoritePage = (await import('./+page.svelte')).default;

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

const bananas: FavoriteItemDto = {
	id: 1,
	userId: 1,
	listId: 5,
	name: 'Bananas',
	defaultCategoryId: null,
	defaultQuantity: '1 bunch',
	storeId: null,
	notes: null,
	price: null,
	createdAt: TS,
	updatedAt: null,
	deletedAt: null,
	version: 1
};

describe('Edit Favorite +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(fetchFavorites).mockResolvedValue([bananas]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(EditFavoritePage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('prefills the form with the favorite being edited', async () => {
		render(EditFavoritePage);

		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');
		await expect.element(page.getByLabelText('Quantity (optional)')).toHaveValue('1 bunch');
	});

	it('saves changes and navigates back to the favorites list', async () => {
		vi.mocked(fetchStores).mockResolvedValue([corner]);
		vi.mocked(updateFavorite).mockResolvedValue({ ...bananas, name: 'Ripe Bananas' });

		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Name').fill('Ripe Bananas');
		await page.getByLabelText('Quantity (optional)').fill('2 bunches');
		await page.getByLabelText('Price (optional)').fill('3.50');
		await page.getByLabelText('Category').selectOptions('10');
		await page.getByLabelText('Store').selectOptions('20');
		await page.getByLabelText('Notes (optional)').fill('Ripe ones');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateFavorite).toHaveBeenCalledWith(5, 1, {
			name: 'Ripe Bananas',
			defaultQuantity: '2 bunches',
			notes: 'Ripe ones',
			price: 350,
			defaultCategoryId: 10,
			storeId: 20
		});
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/5/favorites');
	});

	it('prefills a price and clears quantity/notes/price to null on save', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([
			{ ...bananas, price: 500, defaultQuantity: null }
		]);
		vi.mocked(updateFavorite).mockResolvedValue({ ...bananas, price: null });

		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Price (optional)')).toHaveValue('5.00');

		await page.getByLabelText('Quantity (optional)').fill('');
		await page.getByLabelText('Price (optional)').fill('');
		await page.getByLabelText('Notes (optional)').fill('');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateFavorite).toHaveBeenCalledWith(5, 1, {
			name: 'Bananas',
			defaultQuantity: null,
			notes: null,
			price: null,
			defaultCategoryId: null,
			storeId: null
		});
	});

	it('does not submit when the name is only whitespace', async () => {
		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		const input = page.getByLabelText('Name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		expect(updateFavorite).not.toHaveBeenCalled();
	});

	it('ignores a non-numeric price entry', async () => {
		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByLabelText('Price (optional)').fill('abc');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(updateFavorite).not.toHaveBeenCalled();
	});

	it('hides the Category field when the list opts out of categories', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });

		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await expect.element(page.getByLabelText('Category')).not.toBeInTheDocument();
	});

	it('shows an error when the favorite is not found', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([]);

		render(EditFavoritePage);

		await expect.element(page.getByText('Favorite not found.')).toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(EditFavoritePage);

		await expect.element(page.getByText('Failed to load favorite.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(EditFavoritePage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('shows a generic error message when saving fails without an ApiError', async () => {
		vi.mocked(updateFavorite).mockRejectedValue(new TypeError('network down'));

		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to save favorite.')).toBeInTheDocument();
	});

	it('shows the ApiError message when saving fails', async () => {
		vi.mocked(updateFavorite).mockRejectedValue(new ApiError(409, 'Favorite already exists'));

		render(EditFavoritePage);
		await expect.element(page.getByLabelText('Name')).toHaveValue('Bananas');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Favorite already exists')).toBeInTheDocument();
	});
});
