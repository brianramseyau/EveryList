import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '5' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/favorites', () => ({
	fetchFavorites: vi.fn(),
	deleteFavorite: vi.fn(),
	addFavoriteToList: vi.fn()
}));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchItems: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ fetchStores: vi.fn() }));

const { fetchFavorites, deleteFavorite, addFavoriteToList } = await import('$lib/api/favorites');
const { fetchList } = await import('$lib/api/lists');
const { fetchItems } = await import('$lib/api/items');
const { fetchStores } = await import('$lib/api/stores');
const { goto } = await import('$app/navigation');
const FavoritesPage = (await import('./+page.svelte')).default;

const bananas = {
	id: 1,
	userId: 1,
	listId: 5,
	name: 'Bananas',
	defaultCategoryId: null,
	defaultQuantity: '1 bunch',
	storeId: null,
	notes: null,
	price: null,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	deletedAt: null,
	version: 1
};
const groceries = {
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
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	version: 1
};

describe('Favorites +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchFavorites).mockResolvedValue([bananas]);
		vi.mocked(fetchList).mockResolvedValue(groceries);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(FavoritesPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchFavorites).mockRejectedValue(new TypeError('network down'));

		render(FavoritesPage);

		await expect.element(page.getByText('Failed to load favorites.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchFavorites).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(FavoritesPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('renders favorites with their default quantity', async () => {
		render(FavoritesPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('(1 bunch)')).toBeInTheDocument();
	});

	it('renders a favorite with no default quantity without the parenthetical', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([{ ...bananas, defaultQuantity: null }]);

		render(FavoritesPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('(1 bunch)')).not.toBeInTheDocument();
	});

	it('removes a favorite', async () => {
		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove Bananas from favorites' }).click();

		expect(deleteFavorite).toHaveBeenCalledWith(5, 1);
		await expect
			.element(page.getByText('No favorites yet — tap + to add one.'))
			.toBeInTheDocument();
	});

	it('links to the new-favorite screen', async () => {
		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const link = page.getByRole('link', { name: 'New favorite' });
		await expect.element(link).toBeInTheDocument();
		expect(link.element().getAttribute('href')).toBe('/lists/5/favorites/new');
	});

	it('links to the edit screen for a favorite', async () => {
		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const link = page.getByRole('link', { name: 'Edit Bananas' });
		await expect.element(link).toBeInTheDocument();
		expect(link.element().getAttribute('href')).toBe('/lists/5/favorites/1');
	});

	it('adds a favorite to the list by tapping its row', async () => {
		vi.mocked(addFavoriteToList).mockResolvedValue({
			id: 50,
			listId: 5,
			name: 'Bananas',
			quantity: '1 bunch',
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add Bananas to list' }).click();

		expect(addFavoriteToList).toHaveBeenCalledWith(5, 1);
	});

	it('allows re-adding a favorite whose matching item is already checked off', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			{
				id: 9,
				listId: 5,
				name: 'Bananas',
				quantity: null,
				notes: null,
				categoryId: null,
				storeId: null,
				price: null,
				checked: true,
				checkedAt: '2026-08-01T00:00:00.000Z',
				sortOrder: 0,
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: null,
				version: 1
			}
		]);

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await expect
			.element(page.getByRole('button', { name: 'Add Bananas to list' }))
			.not.toBeDisabled();
		await expect.element(page.getByTitle('Already on this list')).not.toBeInTheDocument();
	});

	it('leaves other favorites in place when one is removed', async () => {
		const bread = { ...bananas, id: 2, name: 'Bread', defaultQuantity: null };
		vi.mocked(fetchFavorites).mockResolvedValue([bananas, bread]);

		render(FavoritesPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove Bananas from favorites' }).click();

		expect(deleteFavorite).toHaveBeenCalledWith(5, 1);
		await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
	});

	it('shows a store subtitle, colored by the store, for a favorite with a store', async () => {
		vi.mocked(fetchStores).mockResolvedValue([
			{
				id: 7,
				name: 'Corner Shop',
				color: '#123456',
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: null,
				version: 1
			}
		]);
		vi.mocked(fetchFavorites).mockResolvedValue([{ ...bananas, storeId: 7 }]);

		render(FavoritesPage);

		const subtitle = page.getByRole('listitem').getByText('Corner Shop');
		await expect.element(subtitle).toBeInTheDocument();
		expect(getComputedStyle(subtitle.element()).color).toBe('rgb(18, 52, 86)');
	});

	it('shows an "already on this list" badge for a favorite whose name is already an item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			{
				id: 9,
				listId: 5,
				name: 'bananas',
				quantity: null,
				notes: null,
				categoryId: null,
				storeId: null,
				price: null,
				checked: false,
				checkedAt: null,
				sortOrder: 0,
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: null,
				version: 1
			}
		]);

		render(FavoritesPage);

		await expect.element(page.getByTitle('Already on this list')).toBeInTheDocument();
	});

	it('does not render a store subtitle when the favorite store is not in the list stores', async () => {
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(fetchFavorites).mockResolvedValue([{ ...bananas, storeId: 99 }]);

		render(FavoritesPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('Corner Shop');
	});

	it('reloads and restores the favorite when removing it fails', async () => {
		// removeFavorite removes it optimistically, then on failure reloads
		// from the server — which restores it, since the delete never actually
		// went through. The reload resolves a fresh (but equal) favorite object,
		// so the restored row re-renders with an unchanged name.
		vi.mocked(deleteFavorite).mockRejectedValue(new Error('boom'));
		vi.mocked(fetchFavorites)
			.mockResolvedValueOnce([bananas])
			.mockResolvedValueOnce([{ ...bananas }]);

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove Bananas from favorites' }).click();

		await expect.poll(() => vi.mocked(fetchFavorites).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('shows the ApiError message when removing a favorite fails', async () => {
		// removeFavorite's catch sets the ApiError message and then triggers a
		// reload, which on success clears `error` again — hold the reload's
		// fetchFavorites() open so the message is observable before that happens.
		vi.mocked(deleteFavorite).mockRejectedValue(new ApiError(500, 'Could not delete'));
		let resolveReload: (favorites: (typeof bananas)[]) => void = () => {};
		vi.mocked(fetchFavorites)
			.mockResolvedValueOnce([bananas])
			.mockImplementationOnce(() => new Promise((resolve) => (resolveReload = resolve)));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove Bananas from favorites' }).click();

		await expect.element(page.getByText('Could not delete')).toBeInTheDocument();
		resolveReload!([bananas]);
	});

	it('adds a favorite back to its list', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			{
				id: 9,
				listId: 5,
				name: 'Bread',
				quantity: null,
				notes: null,
				categoryId: null,
				storeId: null,
				price: null,
				checked: false,
				checkedAt: null,
				sortOrder: 0,
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: null,
				version: 1
			}
		]);
		vi.mocked(addFavoriteToList).mockResolvedValue({
			id: 50,
			listId: 5,
			name: 'Bananas',
			quantity: '1 bunch',
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add Bananas to list' }).click();

		expect(addFavoriteToList).toHaveBeenCalledWith(5, 1);
		await expect.element(page.getByText('Added "Bananas" to Groceries.')).toBeInTheDocument();
	});

	it('shows a generic error message when adding to a list fails without an ApiError', async () => {
		vi.mocked(addFavoriteToList).mockRejectedValue(new TypeError('network down'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add Bananas to list' }).click();

		await expect.element(page.getByText('Failed to add item to list.')).toBeInTheDocument();
	});

	it('shows the ApiError message when adding to a list fails', async () => {
		vi.mocked(addFavoriteToList).mockRejectedValue(new ApiError(409, 'Already on that list'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add Bananas to list' }).click();

		await expect.element(page.getByText('Already on that list')).toBeInTheDocument();
	});
});
