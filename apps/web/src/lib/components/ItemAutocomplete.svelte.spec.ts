import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$lib/api/favorites', () => ({ fetchFavorites: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchRecentItemNames: vi.fn() }));

const { fetchFavorites } = await import('$lib/api/favorites');
const { fetchRecentItemNames } = await import('$lib/api/items');
const ItemAutocomplete = (await import('./ItemAutocomplete.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

function favorite(name: string) {
	return {
		id: 1,
		listId: 1,
		userId: 1,
		name,
		defaultCategoryId: null,
		defaultQuantity: null,
		storeId: null,
		notes: null,
		price: null,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
		version: 1
	};
}

describe('ItemAutocomplete.svelte', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('shows no suggestions before the input has any text', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([favorite('Bananas')]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue(['Bread']);

		render(ItemAutocomplete, { listId: 1, value: '', existingNames: [] });
		await page.getByPlaceholder('Item name').click();

		await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
	});

	it('shows favorites and recent names filtered by the typed text, favorites marked with a heart', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([favorite('Bananas')]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue(['Bread', 'Butter']);

		render(ItemAutocomplete, { listId: 1, value: '', existingNames: [] });
		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('B');

		await expect.element(page.getByRole('button', { name: 'Bananas' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Bread' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Butter' })).toBeInTheDocument();
	});

	it('clears the input and calls onselect with the picked name, leaving the caller to add it', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([favorite('Bananas')]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue([]);
		const onselect = vi.fn();

		render(ItemAutocomplete, { listId: 1, value: '', existingNames: [], onselect });
		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('ban');
		await page.getByRole('button', { name: 'Bananas' }).click();

		expect(onselect).toHaveBeenCalledWith('Bananas');
		await expect.element(input).toHaveValue('');
		await expect.element(page.getByRole('button', { name: 'Bananas' })).not.toBeInTheDocument();
	});

	it('badges a suggestion that already exists on the list', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([favorite('Bananas')]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue([]);

		render(ItemAutocomplete, { listId: 1, value: '', existingNames: ['bananas'] });
		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('ban');

		await expect.element(page.getByTitle('Already on this list')).toBeInTheDocument();
	});

	it('dedupes a name that is both a favorite and in recent history, keeping only the favorite entry', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([favorite('Bananas')]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue(['bananas']);

		render(ItemAutocomplete, { listId: 1, value: '', existingNames: [] });
		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('ban');

		expect(page.getByRole('button', { name: 'Bananas' }).elements()).toHaveLength(1);
	});

	it('falls back to no suggestions when both sources fail', async () => {
		vi.mocked(fetchFavorites).mockRejectedValue(new Error('offline'));
		vi.mocked(fetchRecentItemNames).mockRejectedValue(new Error('offline'));

		render(ItemAutocomplete, { listId: 1, value: '', existingNames: [] });
		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('ban');

		await expect.element(page.getByRole('button', { name: 'Bananas' })).not.toBeInTheDocument();
	});
});
