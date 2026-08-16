import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto, SyncEventDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import { HOLD_MS } from '$lib/actions/press-hold-reorder';

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({
	fetchList: vi.fn()
}));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/items', () => ({
	fetchItems: vi.fn(),
	createItem: vi.fn(),
	deleteItem: vi.fn(),
	updateItem: vi.fn(),
	fetchRecentItemNames: vi.fn()
}));
vi.mock('$lib/api/favorites', () => ({ fetchFavorites: vi.fn() }));
vi.mock('$lib/api/stores', () => ({ fetchStoreCategoryOrder: vi.fn(), fetchStores: vi.fn() }));
vi.mock('$lib/api/selected-store', () => ({
	getSelectedStore: vi.fn(),
	setSelectedStore: vi.fn()
}));
vi.mock('$lib/realtime', () => ({ subscribeToList: vi.fn(() => vi.fn()) }));
vi.mock('$lib/pwa/badge', () => ({ refreshBadgeCount: vi.fn() }));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchItems, createItem, deleteItem, updateItem, fetchRecentItemNames } =
	await import('$lib/api/items');
const { fetchFavorites } = await import('$lib/api/favorites');
const { fetchStoreCategoryOrder, fetchStores } = await import('$lib/api/stores');
const { getSelectedStore } = await import('$lib/api/selected-store');
const { subscribeToList } = await import('$lib/realtime');
const { refreshBadgeCount } = await import('$lib/pwa/badge');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { goto } = await import('$app/navigation');
const ListDetailPage = (await import('./+page.svelte')).default;

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
const produce = {
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
const dairy = {
	id: 11,
	listId: null,
	name: 'Dairy',
	icon: 'milk',
	sortOrder: 1,
	isDefault: true,
	createdAt: TS,
	updatedAt: null,
	deletedAt: null,
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
		deletedAt: null,
		version: 1,
		...overrides
	};
}

describe('List detail +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(getSelectedStore).mockResolvedValue(null);
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(fetchRecentItemNames).mockResolvedValue([]);
		vi.mocked(fetchFavorites).mockResolvedValue([]);
	});

	afterEach(async () => {
		vi.clearAllMocks();
		clearToken();
		window.sessionStorage.clear();
		window.localStorage.clear();
		await resetDbForTesting();
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

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(ListDetailPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('applies the store-specific category order when a store is selected', async () => {
		vi.mocked(getSelectedStore).mockResolvedValue(7);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 7, categoryId: 10, sortOrder: 5, deletedAt: null, version: 1 },
			{ id: 2, storeId: 7, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 }
		]);
		// Tagged to the selected store (7) — otherwise the new auto-filter
		// (PHASE10_PLAN.md #0.5) would hide them, since they'd belong to no
		// store while a store is selected.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 7 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11, storeId: 7 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		expect(fetchStoreCategoryOrder).toHaveBeenCalledWith(7);

		// Dairy (sortOrder override 0) should now be ordered before Produce
		// (sortOrder override 5), the reverse of their default sortOrder.
		const headings = document.querySelectorAll('h2');
		const headingTexts = [...headings].map((h) => h.textContent?.trim());
		const dairyIndex = headingTexts.findIndex((t) => t === 'Dairy');
		const produceIndex = headingTexts.findIndex((t) => t === 'Produce');
		expect(dairyIndex).toBeGreaterThanOrEqual(0);
		expect(produceIndex).toBeGreaterThan(dairyIndex);
	});

	it('groups items with no category under "Uncategorized"', async () => {
		vi.mocked(fetchItems).mockResolvedValue([makeItem({ id: 100, name: 'Mystery item' })]);

		render(ListDetailPage);

		await expect.element(page.getByText('Mystery item')).toBeInTheDocument();
		await expect.element(page.getByText('Uncategorized')).toBeInTheDocument();
	});

	it('groups items by category, keeping checked items under the same header without reordering them', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			// Checked item listed FIRST — it must stay first, not sink below
			// the unchecked one that follows it.
			makeItem({
				id: 101,
				name: 'Milk',
				categoryId: 10,
				checked: true,
				checkedAt: '2026-08-13T00:00:00.000Z',
				sortOrder: 0
			}),
			makeItem({ id: 100, name: 'Bananas', quantity: '2', categoryId: 10, sortOrder: 1 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).toBeInTheDocument();
		// No separate "Checked" section heading exists anymore.
		await expect.element(page.getByText('Checked', { exact: true })).not.toBeInTheDocument();

		const produceHeader = page.getByText('Produce').element().closest('h2');
		expect(produceHeader).not.toBeNull();
		expect(produceHeader?.style.color).toBe('rgb(59, 130, 246)');

		// Both items render under the same "Produce" section, in their
		// original order — checked status doesn't move Milk to the end.
		const names = [...produceHeader!.parentElement!.querySelectorAll('li span')]
			.map((el) => el.textContent?.trim())
			.filter((t) => t === 'Bananas' || t === 'Milk');
		expect(names).toEqual(['Milk', 'Bananas']);

		// Neither item has a price set, so the progress strip's total is hidden.
		await expect.element(page.getByText('1 of 2 done')).toBeInTheDocument();
		await expect.element(page.getByText(/^Total:/)).not.toBeInTheDocument();
	});

	it('hides checked items when the eye toggle is switched off, and shows them again on toggle', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Hide checked items' }).click();
		await expect.element(page.getByText('Milk')).not.toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Show checked items' }).click();
		await expect.element(page.getByText('Milk')).toBeInTheDocument();
	});

	it('remembers the hide-checked-items toggle for this list across remounts', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 10, checked: true })
		]);

		const { unmount } = render(ListDetailPage);
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Hide checked items' }).click();
		await expect.element(page.getByText('Milk')).not.toBeInTheDocument();

		unmount();
		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Show checked items' }))
			.toBeInTheDocument();
	});

	it('drops a category section entirely once its only item is checked and hidden', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Milk', categoryId: 11, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Dairy')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Hide checked items' }).click();

		await expect.element(page.getByText('Dairy')).not.toBeInTheDocument();
	});

	it('links to Favorites, Recently Deleted, Stores, and List settings from the header', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const favoritesLink = page.getByRole('link', { name: 'Favorites' });
		expect(favoritesLink.element().getAttribute('href')).toBe('/lists/1/favorites');

		const recentLink = page.getByRole('link', { name: 'Recently deleted' });
		expect(recentLink.element().getAttribute('href')).toBe('/lists/1/recently-deleted');

		const storesLink = page.getByRole('link', { name: 'Stores' });
		expect(storesLink.element().getAttribute('href')).toBe('/lists/1/stores');

		const settingsLink = page.getByRole('link', { name: 'List settings' });
		expect(settingsLink.element().getAttribute('href')).toBe('/lists/1/settings');
	});

	it('links the clipboard icon to the full-screen paste-import screen', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const pasteLink = page.getByRole('link', { name: 'Paste in a list' });
		expect(pasteLink.element().getAttribute('href')).toBe('/lists/1/import');
	});

	it('adds a new item via the form', async () => {
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread' }));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add item' }).click();

		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		expect(createItem).toHaveBeenCalledWith(1, { name: 'Bread' });
	});

	it('keeps an existing item stable when a new item is added', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 })
		]);
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread', categoryId: 10 }));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add item' }).click();

		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('matching an existing unchecked item by name skips the request, keeps the input, and highlights the row instead of duplicating', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const input = page.getByPlaceholder('Item name');
		await input.fill('  BANANAS  ');
		await page.getByRole('button', { name: 'Add item' }).click();

		expect(createItem).not.toHaveBeenCalled();
		await expect.element(input).toHaveValue('  BANANAS  ');
		// Still exactly one "Bananas" row — no duplicate was created.
		expect(page.getByText('Bananas', { exact: true }).elements()).toHaveLength(1);
	});

	it('clears a row highlight after it fades, and restarts the timer on a second match before it fires', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const row = () => page.getByText('Bananas').element().closest('div.item-row') as HTMLElement;
		const input = page.getByPlaceholder('Item name');

		await input.fill('bananas');
		await page.getByRole('button', { name: 'Add item' }).click();
		expect(row().className).toContain('item-row-highlight');

		// Re-matching before the first highlight fades restarts the timer
		// rather than leaving two competing timeouts.
		await input.fill('bananas');
		await page.getByRole('button', { name: 'Add item' }).click();
		expect(row().className).toContain('item-row-highlight');

		await expect
			.poll(() => row().className.includes('item-row-highlight'), { timeout: 2000 })
			.toBe(false);
	});

	it('replaces the existing row in place, instead of duplicating, when the server matches an existing item by id', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Milk', categoryId: 10, checked: true }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		// A checked item isn't caught by the local pre-check (it's excluded on
		// purpose — re-adding it should uncheck it via the server, not just
		// highlight it), so this exercises the server-match branch instead.
		vi.mocked(createItem).mockResolvedValue(
			makeItem({ id: 100, name: 'Milk', categoryId: 10, checked: false })
		);

		render(ListDetailPage);
		await expect.element(page.getByRole('checkbox', { name: 'Milk' })).toBeChecked();

		await page.getByPlaceholder('Item name').fill('milk');
		await page.getByRole('button', { name: 'Add item' }).click();

		await expect.element(page.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked();
		expect(page.getByText('Milk', { exact: true }).elements()).toHaveLength(1);
		await expect.element(page.getByPlaceholder('Item name')).toHaveValue('');
		// A sibling row is left untouched by the in-place replace.
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
	});

	it('passes the current item names to the autocomplete so it can badge suggestions already on the list', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(fetchFavorites).mockResolvedValue([]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue(['Bananas']);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('ban');

		await expect.element(page.getByTitle('Already on this list')).toBeInTheDocument();
	});

	it('clears the input when a picked suggestion matches an existing unchecked item, highlighting it instead of adding a duplicate', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(fetchFavorites).mockResolvedValue([]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue(['Bananas']);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('ban');
		page.getByTitle('Already on this list').element().closest('button')!.click();

		expect(createItem).not.toHaveBeenCalled();
		await expect.element(input).toHaveValue('');
		expect(page.getByText('Bananas', { exact: true }).elements()).toHaveLength(1);
	});

	it('adds the item immediately when a suggestion is picked, without touching the Add button', async () => {
		vi.mocked(fetchFavorites).mockResolvedValue([]);
		vi.mocked(fetchRecentItemNames).mockResolvedValue(['Bread']);
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread' }));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const input = page.getByPlaceholder('Item name');
		await input.click();
		await input.fill('bre');
		await page.getByRole('button', { name: 'Bread' }).click();

		expect(createItem).toHaveBeenCalledWith(1, { name: 'Bread' });
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(input).toHaveValue('');
	});

	it('does not submit when the new item name is only whitespace', async () => {
		// The Add button is already disabled in this state, but handleAddItem
		// carries its own guard, reachable via a raw 'submit' event and not
		// just a click on the (disabled) button.
		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const input = page.getByPlaceholder('Item name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createItem).mock.calls.length).toBe(0);
	});

	it('shows a generic error message when adding an item fails without an ApiError', async () => {
		vi.mocked(createItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add item' }).click();

		await expect.element(page.getByText('Failed to add item.')).toBeInTheDocument();
	});

	it('shows the ApiError message when adding an item fails', async () => {
		vi.mocked(createItem).mockRejectedValue(new ApiError(422, 'Duplicate item'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add item' }).click();

		await expect.element(page.getByText('Duplicate item')).toBeInTheDocument();
	});

	it("links a desktop edit icon to an item's detail screen, and the item's name is no longer a link", async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const editLink = page.getByRole('link', { name: 'Edit Bananas' });
		expect(editLink.element().getAttribute('href')).toBe('/lists/1/items/100');
		await expect
			.element(page.getByRole('link', { name: 'Bananas', exact: true }))
			.not.toBeInTheDocument();
	});

	it('shows a store subheading under an item tagged with a store, and none for an untagged item', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Corner Shop')).toBeInTheDocument();
		const breadRow = page.getByText('Bread').element().closest('li') as HTMLElement;
		expect(breadRow.textContent).not.toContain('Corner Shop');
	});

	it("colors the header's store icon to match the currently selected store", async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(getSelectedStore).mockResolvedValue(20);

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement;
		const colorSpan = storesLink.querySelector('span') as HTMLElement;
		expect(colorSpan.style.color).toBe('rgb(59, 130, 246)');
	});

	it('toggles one item checked without affecting a sibling item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('0 of 2 done')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: true });
		await expect.element(page.getByText('1 of 2 done')).toBeInTheDocument();
		// Bread stays unchecked, proving the map only updates the toggled item.
		await expect.element(page.getByRole('checkbox', { name: 'Bread' })).not.toBeChecked();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('unchecks a checked item in place', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).toBeChecked();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: false });
		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).not.toBeChecked();
	});

	it('auto-filters items down to the currently selected store, with no filter UI to override it here', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(getSelectedStore).mockResolvedValue(20);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).not.toBeInTheDocument();
	});

	it('explains that the store filter is hiding every item, when the list is non-empty but the filter matches nothing', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(getSelectedStore).mockResolvedValue(20);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText(/No items are tagged for Corner Shop/)).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.not.toBeInTheDocument();
	});

	it('falls back to a generic filter-empty message when the selected store no longer exists', async () => {
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(getSelectedStore).mockResolvedValue(20);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);

		await expect
			.element(page.getByText('No items match the currently selected store.'))
			.toBeInTheDocument();
	});

	it('shows every item when no store is currently selected', async () => {
		const store = {
			id: 20,
			name: 'Corner Shop',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		vi.mocked(fetchStores).mockResolvedValue([store]);
		vi.mocked(getSelectedStore).mockResolvedValue(null);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
	});

	it('shows the running total from item prices without a per-item price field', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, price: 399 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, price: 250 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await expect.element(page.getByPlaceholder('Price')).not.toBeInTheDocument();
		await expect.element(page.getByText('Total: $6.49')).toBeInTheDocument();

		// Toggling a checkbox reassigns `items` without touching any price, so
		// the running total recomputes to the same value it already displayed.
		await page.getByRole('checkbox', { name: 'Bread' }).click();
		await expect.element(page.getByText('Total: $6.49')).toBeInTheDocument();
	});

	it('reloads the list when toggling checked fails without an ApiError', async () => {
		// toggleChecked's catch sets `error` and immediately triggers a reload
		// via loadAll(), which flips `loading` back to true in the same tick —
		// the page collapses to its "Loading…" state before the error message
		// ever paints, so what's observable here is the reload itself.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('checkbox').click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('reloads the list when toggling checked fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new ApiError(500, 'Could not update'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('checkbox').click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('removes a checked item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete Bananas' }).click();

		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	it('removes an item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete Bananas' }).click();

		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	function rowFor(name: string): HTMLElement {
		return page.getByText(name).element().closest('li') as HTMLElement;
	}

	async function drag(fromName: string, belowElementSelector: () => Element) {
		const row = rowFor(fromName);
		const targetRect = belowElementSelector().getBoundingClientRect();

		row.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		row.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: targetRect.top + targetRect.height + 1
			})
		);
		row.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: targetRect.top + targetRect.height + 1
			})
		);
	}

	it('reorders two items within the same category by dragging', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await drag('Bananas', () => page.getByText('Bread').element());

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: 10 }));
	});

	it('recategorizes an item by dragging it into a different category section', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		await drag('Bananas', () => page.getByText('Milk').element());

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: 11 }));
	});

	it('reorders an item to a middle position, ahead of an existing neighbor', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 }),
			makeItem({ id: 102, name: 'Carrots', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Carrots')).toBeInTheDocument();

		// Drop just above Bread (not below the last item) — Bread is the
		// target neighbor, so the insertion point is computed from its index
		// rather than falling back to the end of the list.
		const row = rowFor('Carrots');
		const breadRect = page.getByText('Bread').element().closest('li')!.getBoundingClientRect();
		row.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		row.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: breadRect.top
			})
		);
		row.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: breadRect.top
			})
		);

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 102, expect.objectContaining({ categoryId: 10 }));
	});

	it('does not call updateItem when a drag never crosses into a new position', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const row = rowFor('Bananas');
		row.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		// Pointer stays over the same slot — onhover still fires, but with
		// toIndex === fromIndex.
		row.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		row.dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);

		expect(updateItem).not.toHaveBeenCalled();
	});

	it('falls back to the uncategorized bucket when dragged past the last item of an all-uncategorized list', async () => {
		vi.mocked(fetchCategories).mockResolvedValue([]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: null }),
			makeItem({ id: 101, name: 'Bread', categoryId: null })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await drag('Bananas', () => page.getByText('Bread').element());

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: null }));
	});

	it('reloads the list when reordering an item fails without an ApiError', async () => {
		// reordering's catch, like toggleChecked's, sets `error` and then
		// reloads — the reload's `loading = true` collapses the page before
		// the message paints, so the observable effect is the reload itself.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await drag('Bananas', () => page.getByText('Bread').element());

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('reloads the list when reordering an item fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new ApiError(500, 'Could not reorder'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await drag('Bananas', () => page.getByText('Bread').element());

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('reloads the list when removing an item fails without an ApiError', async () => {
		// removeItem's catch, like toggleChecked's, sets `error` and then
		// reloads — the reload's `loading = true` collapses the page before
		// the message paints, so the observable effect is the reload itself.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(deleteItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete Bananas' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('reloads the list when removing an item fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(deleteItem).mockRejectedValue(new ApiError(500, 'Could not delete'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete Bananas' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	function mockCoarsePointer() {
		return vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true,
			media: '(pointer: coarse)',
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		} as unknown as MediaQueryList);
	}

	it('hides the desktop delete/edit icons and swipes right to delete on a coarse-pointer device', async () => {
		const matchMediaSpy = mockCoarsePointer();
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Delete Bananas' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Edit Bananas' })).not.toBeInTheDocument();

		const row = page
			.getByText('Bananas')
			.element()
			.closest('li')!
			.querySelector(':scope > div:last-of-type') as HTMLElement;
		row.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		row.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 60, clientY: 0 })
		);
		row.dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 60, clientY: 0 })
		);

		await expect.poll(() => vi.mocked(deleteItem).mock.calls.length).toBe(1);
		expect(deleteItem).toHaveBeenCalledWith(1, 100);

		matchMediaSpy.mockRestore();
	});

	it('swipes left to navigate to item edit on a coarse-pointer device', async () => {
		const matchMediaSpy = mockCoarsePointer();
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const row = page
			.getByText('Bananas')
			.element()
			.closest('li')!
			.querySelector(':scope > div:last-of-type') as HTMLElement;
		row.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		row.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: -60, clientY: 0 })
		);
		row.dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: -60, clientY: 0 })
		);

		expect(deleteItem).not.toHaveBeenCalled();
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists/1/items/100');

		matchMediaSpy.mockRestore();
	});

	it('shows the desktop delete button and disables swipe on a fine-pointer device', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await expect.element(page.getByRole('button', { name: 'Delete Bananas' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Edit Bananas' })).toBeInTheDocument();
	});

	it('subscribes to the list channel and shows a toast on a sync event, refreshing on click', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		const unsubscribe = vi.fn();
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return unsubscribe;
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
		expect(subscribeToList).toHaveBeenCalledWith(1, expect.any(Function));

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null, version: 1 });
		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
		expect(fetchList).toHaveBeenCalledTimes(2);
	});

	it('suppresses the sync toast for a row with an unacked local edit', async () => {
		const db = getDb()!;
		await db.items.put({
			...makeItem({ id: 1, name: 'Milk' }),
			_dirty: true
		});
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ entityType: 'item', entityId: 1, op: 'update', payload: null, version: 2 });
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
	});

	it('dismisses the sync toast without refreshing', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null, version: 1 });
		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
		expect(fetchList).toHaveBeenCalledTimes(1);
	});

	it('shows the passcode gate instead of the list body for a locked, unopened list', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash: 'abc:def' });

		render(ListDetailPage);

		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.not.toBeInTheDocument();
		// The header/menu stay reachable even while locked (recovery path).
		await expect.element(page.getByRole('link', { name: 'List settings' })).toBeInTheDocument();
	});

	it('reveals the list body once the correct passcode is entered', async () => {
		const { buildPasscodeHash } = await import('$lib/passcode');
		const passcodeHash = await buildPasscodeHash('1234');
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash });

		render(ListDetailPage);
		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();

		await page.getByLabelText('Passcode').fill('1234');
		await page.getByRole('button', { name: 'Unlock' }).click();

		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	it('skips the passcode gate on a later visit within the same session', async () => {
		const { unlockList } = await import('$lib/passcode');
		unlockList(1);
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash: 'abc:def' });

		render(ListDetailPage);

		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
		await expect.element(page.getByText('This list is locked')).not.toBeInTheDocument();
	});
});
