import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$lib/api/favorites', () => ({
	fetchFavorites: vi.fn(),
	createFavorite: vi.fn(),
	deleteFavorite: vi.fn(),
	addFavoriteToList: vi.fn()
}));
vi.mock('$lib/api/lists', () => ({ fetchLists: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { fetchFavorites, createFavorite, deleteFavorite } = await import('$lib/api/favorites');
const { fetchLists } = await import('$lib/api/lists');
const { goto } = await import('$app/navigation');
const FavoritesPage = (await import('./+page.svelte')).default;

const bananas = {
	id: 1,
	userId: 1,
	name: 'Bananas',
	defaultCategoryId: null,
	defaultQuantity: '1 bunch',
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null
};
const groceries = {
	id: 5,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
	ownerId: 1,
	archived: false,
	itemCount: 0,
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null
};

describe('Favorites +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchFavorites).mockResolvedValue([bananas]);
		vi.mocked(fetchLists).mockResolvedValue([groceries]);
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

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(deleteFavorite).toHaveBeenCalledWith(1);
		await expect.element(page.getByText('No favorites yet — add one above.')).toBeInTheDocument();
	});

	it('creates a new favorite from the form', async () => {
		vi.mocked(createFavorite).mockResolvedValue({
			id: 2,
			userId: 1,
			name: 'Bread',
			defaultCategoryId: null,
			defaultQuantity: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('New favorite name').fill('Bread');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		expect(createFavorite).toHaveBeenCalledWith({ name: 'Bread' });
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
		// went through.
		vi.mocked(deleteFavorite).mockRejectedValue(new Error('boom'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

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

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.element(page.getByText('Could not delete')).toBeInTheDocument();
		resolveReload!([bananas]);
	});

	it('adds a favorite to the selected list', async () => {
		const { addFavoriteToList } = await import('$lib/api/favorites');
		vi.mocked(addFavoriteToList).mockResolvedValue({
			id: 50,
			listId: 5,
			name: 'Bananas',
			quantity: '1 bunch',
			notes: null,
			categoryId: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null
		});

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('combobox').selectOptions('Groceries');
		await page.getByRole('button', { name: 'Add to list' }).click();

		expect(addFavoriteToList).toHaveBeenCalledWith(1, 5);
		await expect.element(page.getByText('Added "Bananas" to Groceries.')).toBeInTheDocument();
	});

	it('shows a generic error message when adding to a list fails without an ApiError', async () => {
		const { addFavoriteToList } = await import('$lib/api/favorites');
		vi.mocked(addFavoriteToList).mockRejectedValue(new TypeError('network down'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('combobox').selectOptions('Groceries');
		await page.getByRole('button', { name: 'Add to list' }).click();

		await expect.element(page.getByText('Failed to add item to list.')).toBeInTheDocument();
	});

	it('shows the ApiError message when adding to a list fails', async () => {
		const { addFavoriteToList } = await import('$lib/api/favorites');
		vi.mocked(addFavoriteToList).mockRejectedValue(new ApiError(409, 'Already on that list'));

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('combobox').selectOptions('Groceries');
		await page.getByRole('button', { name: 'Add to list' }).click();

		await expect.element(page.getByText('Already on that list')).toBeInTheDocument();
	});

	it('does not add to a list when none is selected', async () => {
		// The button is already disabled while no list is selected, but
		// handleAddToList carries its own guard reachable independent of the
		// button's disabled state (e.g. a raw click dispatched on the element).
		const { addFavoriteToList } = await import('$lib/api/favorites');

		render(FavoritesPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		page
			.getByRole('button', { name: 'Add to list' })
			.element()
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		await expect.poll(() => vi.mocked(addFavoriteToList).mock.calls.length).toBe(0);
	});
});
