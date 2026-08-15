import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/items', () => ({ fetchRecentItems: vi.fn(), restoreItem: vi.fn() }));

const { fetchList } = await import('$lib/api/lists');
const { fetchRecentItems, restoreItem } = await import('$lib/api/items');
const { goto } = await import('$app/navigation');
const RecentlyDeletedPage = (await import('./+page.svelte')).default;

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
		deletedAt: TS,
		version: 1,
		...overrides
	};
}

describe('Recently Deleted +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchRecentItems).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(RecentlyDeletedPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchRecentItems).mockRejectedValue(new TypeError('network down'));

		render(RecentlyDeletedPage);

		await expect
			.element(page.getByText('Failed to load recently deleted items.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchRecentItems).mockRejectedValue(new ApiError(500, 'Could not load recent'));

		render(RecentlyDeletedPage);

		await expect.element(page.getByText('Could not load recent')).toBeInTheDocument();
	});

	it('shows an empty state when nothing is recently deleted', async () => {
		render(RecentlyDeletedPage);

		await expect.element(page.getByText('Nothing recently deleted.')).toBeInTheDocument();
	});

	it('shows recently deleted items and restores one', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([makeItem({ id: 300, name: 'Eggs' })]);
		vi.mocked(restoreItem).mockResolvedValue(makeItem({ id: 300, name: 'Eggs', deletedAt: null }));

		render(RecentlyDeletedPage);
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		expect(restoreItem).toHaveBeenCalledWith(1, 300);
		await expect.element(page.getByText('Nothing recently deleted.')).toBeInTheDocument();
	});

	it('reloads the list when restoring an item fails without an ApiError', async () => {
		// restoreRecentItem's catch, like the list-detail page's remove/toggle
		// handlers, sets `error` and then reloads — the reload's `loading =
		// true` collapses the page before the message paints, so what's
		// observable here is the reload itself.
		vi.mocked(fetchRecentItems).mockResolvedValue([makeItem({ id: 300, name: 'Eggs' })]);
		vi.mocked(restoreItem).mockRejectedValue(new TypeError('network down'));

		render(RecentlyDeletedPage);
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		await expect.poll(() => vi.mocked(fetchRecentItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();
	});

	it('reloads the list when restoring an item fails with an ApiError', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([makeItem({ id: 300, name: 'Eggs' })]);
		vi.mocked(restoreItem).mockRejectedValue(new ApiError(500, 'Could not restore'));

		render(RecentlyDeletedPage);
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		await expect.poll(() => vi.mocked(fetchRecentItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();
	});
});
