import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '5' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/favorites', () => ({
	fetchFavorites: vi.fn(),
	createFavorite: vi.fn(),
	deleteFavorite: vi.fn(),
	addFavoriteToList: vi.fn()
}));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchItems: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ fetchStores: vi.fn() }));

const { fetchFavorites, createFavorite, deleteFavorite, addFavoriteToList } =
	await import('$lib/api/favorites');
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
		await expect.element(page.getByText('No favorites yet — add one above.')).toBeInTheDocument();
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

	it('creates a new favorite from the form', async () => {
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
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByPlaceholder('Notes (optional)').fill('Whole wheat');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		expect(createFavorite).toHaveBeenCalledWith(5, {
			name: 'Bread',
			storeId: null,
			notes: 'Whole wheat',
			price: null
		});
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
	});

	it('shows a generic error message when creating a favorite fails without an ApiError', async () => {
		vi.mocked(createFavorite).mockRejectedValue(new TypeError('network down'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect.element(page.getByText('Failed to create favorite.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a favorite fails', async () => {
		vi.mocked(createFavorite).mockRejectedValue(new ApiError(422, 'Name already exists'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
	});

	it('does not submit when the price is not a valid number', async () => {
		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByPlaceholder('Price (optional)').fill('not-a-number');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect.poll(() => vi.mocked(createFavorite).mock.calls.length).toBe(0);
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

	it('lets you pick a store when creating a favorite', async () => {
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
		vi.mocked(createFavorite).mockResolvedValue({
			id: 2,
			userId: 1,
			listId: 5,
			name: 'Bread',
			defaultCategoryId: null,
			defaultQuantity: null,
			storeId: 7,
			notes: null,
			price: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByLabelText('Store').selectOptions('7');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		expect(createFavorite).toHaveBeenCalledWith(5, {
			name: 'Bread',
			storeId: 7,
			notes: null,
			price: null
		});
	});

	it('clears the store selection back to no store when creating a favorite', async () => {
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
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByLabelText('Store').selectOptions('7');
		await page.getByRole('button', { name: 'Close' }).last().click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		expect(createFavorite).toHaveBeenCalledWith(5, {
			name: 'Bread',
			storeId: null,
			notes: null,
			price: null
		});
	});

	it('does not render a store subtitle when the favorite store is not in the list stores', async () => {
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(fetchFavorites).mockResolvedValue([{ ...bananas, storeId: 99 }]);

		render(FavoritesPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('Corner Shop');
	});

	it('does not submit when the favorite name is only whitespace', async () => {
		// The Add button is already disabled in this state, but handleCreate
		// carries its own guard (it's the target of the form's onsubmit, which
		// a raw 'submit' event — not just the button click — can trigger).
		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const input = page.getByPlaceholder('New favorite name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createFavorite).mock.calls.length).toBe(0);
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
