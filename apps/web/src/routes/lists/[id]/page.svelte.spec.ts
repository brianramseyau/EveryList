import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto, SyncEventDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import type { SortableReorderParams } from '$lib/actions/sortable-reorder';
import type { ConflictListener, FlushOutcomeListener } from '$lib/offline/flush';
import { markSelfMutation, resetSelfMutationsForTesting } from '$lib/offline/self-mutations';
import { resetUndoForTesting } from '$lib/undo';
import { consumeListOrigin, rememberListScroll } from '$lib/nav-direction';

// SortableJS drives real mouse/touch gestures against real layout, neither of
// which a component test can reliably reproduce — its own behavior (does it
// fire onDrop, does it skip a no-op drop) is the library's job, not this
// page's. This test double swaps that engine out for a hook that lets tests
// invoke the page's own onDrop handler directly with whatever params a real
// drag would have produced, so these tests cover the page's reorder logic
// rather than re-proving SortableJS works.
vi.mock('$lib/actions/sortable-reorder', () => ({
	sortableReorder: (
		node: HTMLElement & { __onDrop?: SortableReorderParams['onDrop'] },
		params: SortableReorderParams
	) => {
		node.__onDrop = params.onDrop;
		return {
			update(next: SortableReorderParams) {
				node.__onDrop = next.onDrop;
			},
			destroy() {
				delete node.__onDrop;
			}
		};
	}
}));

// The real longPress action's hold-timer behavior is unit-tested in its own
// spec — this double just surfaces the onLongPress callback on the node so a
// page test can invoke the quick-select menu directly, the same way the
// sortable-reorder double exposes onDrop.
vi.mock('$lib/actions/long-press', () => ({
	longPress: (
		node: HTMLElement & { __onLongPress?: () => void },
		params: { onLongPress: () => void }
	) => {
		node.__onLongPress = params.onLongPress;
		return {
			update(next: { onLongPress: () => void }) {
				node.__onLongPress = next.onLongPress;
			},
			destroy() {
				delete node.__onLongPress;
			}
		};
	}
}));

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({
	fetchList: vi.fn(),
	getCachedList: vi.fn(),
	emailExportList: vi.fn()
}));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn(), getCachedCategories: vi.fn() }));
vi.mock('$lib/api/category-learnings', () => ({ fetchCategoryLearnings: vi.fn() }));
vi.mock('$lib/api/items', () => ({
	fetchItems: vi.fn(),
	getCachedItems: vi.fn(),
	createItem: vi.fn(),
	deleteItem: vi.fn(),
	undoDeleteItem: vi.fn(),
	updateItem: vi.fn(),
	fetchRecentItemNames: vi.fn()
}));
vi.mock('$lib/api/favorites', () => ({ fetchFavorites: vi.fn() }));
vi.mock('$lib/api/stores', () => ({
	fetchStoreCategoryOrder: vi.fn(),
	fetchStores: vi.fn(),
	getCachedStores: vi.fn()
}));
vi.mock('$lib/api/selected-store', () => ({
	getSelectedStoreSettings: vi.fn(),
	setSelectedStoreSettings: vi.fn()
}));
vi.mock('$lib/realtime', () => ({ subscribeToList: vi.fn(() => vi.fn()) }));
vi.mock('$lib/offline/flush', () => ({
	onConflict: vi.fn(() => vi.fn()),
	onFlushOutcome: vi.fn(() => vi.fn()),
	onCreateRejected: vi.fn(() => vi.fn())
}));
vi.mock('$lib/pwa/badge', () => ({ refreshBadgeCount: vi.fn() }));
vi.mock('$lib/open-external-link', () => ({ openExternalLink: vi.fn() }));

const { fetchList, getCachedList, emailExportList } = await import('$lib/api/lists');
const { fetchCategories, getCachedCategories } = await import('$lib/api/categories');
const { fetchCategoryLearnings } = await import('$lib/api/category-learnings');
const {
	fetchItems,
	getCachedItems,
	createItem,
	deleteItem,
	undoDeleteItem,
	updateItem,
	fetchRecentItemNames
} = await import('$lib/api/items');
const { fetchFavorites } = await import('$lib/api/favorites');
const { fetchStoreCategoryOrder, fetchStores, getCachedStores } = await import('$lib/api/stores');
const { getSelectedStoreSettings, setSelectedStoreSettings } =
	await import('$lib/api/selected-store');
const { subscribeToList } = await import('$lib/realtime');
const { refreshBadgeCount } = await import('$lib/pwa/badge');
const { openExternalLink } = await import('$lib/open-external-link');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { onConflict, onFlushOutcome, onCreateRejected } = await import('$lib/offline/flush');
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
		vi.mocked(getCachedList).mockResolvedValue(undefined);
		vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(getCachedCategories).mockResolvedValue(undefined);
		vi.mocked(fetchCategoryLearnings).mockResolvedValue([]);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(getCachedItems).mockResolvedValue(undefined);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(getCachedStores).mockResolvedValue(undefined);
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: null,
			filter: 'store'
		});
		vi.mocked(setSelectedStoreSettings).mockResolvedValue(undefined);
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(fetchRecentItemNames).mockResolvedValue([]);
		vi.mocked(fetchFavorites).mockResolvedValue([]);
	});

	afterEach(async () => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
		clearToken();
		window.sessionStorage.clear();
		window.localStorage.clear();
		window.history.replaceState(null, '', '/');
		resetSelfMutationsForTesting();
		resetUndoForTesting();
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

	it('paints instantly from the Dexie cache, without waiting on the network revalidation', async () => {
		vi.mocked(getCachedList).mockResolvedValue(list);
		vi.mocked(getCachedCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(getCachedItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(getCachedStores).mockResolvedValue([]);
		// Never resolves during this test — proves the cached paint above didn't wait on it.
		vi.mocked(fetchList).mockReturnValue(new Promise(() => {}));
		vi.mocked(fetchCategories).mockReturnValue(new Promise(() => {}));
		vi.mocked(fetchItems).mockReturnValue(new Promise(() => {}));
		vi.mocked(fetchStores).mockReturnValue(new Promise(() => {}));

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Loading…')).not.toBeInTheDocument();
	});

	it('still shows the loading placeholder on a first-ever visit with nothing cached yet', async () => {
		let resolveFetch!: (value: typeof list) => void;
		vi.mocked(fetchList).mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			})
		);

		render(ListDetailPage);

		await expect.element(page.getByText('Loading…')).toBeInTheDocument();

		resolveFetch(list);

		await expect.element(page.getByText('Loading…')).not.toBeInTheDocument();
	});

	it('sets the document title to the loading fallback before the list resolves, then to the list name', async () => {
		let resolveFetch!: (value: typeof list) => void;
		vi.mocked(fetchList).mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			})
		);

		render(ListDetailPage);

		expect(document.title).toBe('List — EveryList');

		resolveFetch(list);

		await expect.poll(() => document.title).toBe('Groceries — EveryList');
	});

	it("pins each category's sticky sub-heading at the fixed header's measured height, and pads the item list to match", async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		const header = document.querySelector('div.fixed');
		await expect.poll(() => header?.clientHeight ?? 0).toBeGreaterThan(0);
		const headerHeight = header!.clientHeight;

		const heading = [...document.querySelectorAll('h2')].find(
			(h) => h.textContent?.trim() === 'Dairy'
		)!;
		expect(heading.style.top).toBe(`${headerHeight - 1}px`);

		const content = header!.nextElementSibling as HTMLElement;
		expect(content.style.paddingTop).toBe(`${headerHeight}px`);
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(ListDetailPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('applies the store-specific category order when a store is selected', async () => {
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 7,
			filter: 'store'
		});
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 7, categoryId: 10, sortOrder: 5, deletedAt: null, version: 1 },
			{ id: 2, storeId: 7, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 }
		]);
		// Tagged to the selected store (7) — otherwise the new auto-filter
		// (PLAN_10_PHASE_VALIDATION_USABILITY.md #0.5) would hide them, since they'd belong to no
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

	it('renders a flat list with no category headers when the list opts out of categories', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11, sortOrder: 1 }),
			makeItem({ id: 102, name: 'Mystery item', categoryId: null, sortOrder: 2 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).toBeInTheDocument();
		await expect.element(page.getByText('Mystery item')).toBeInTheDocument();
		await expect.element(page.getByText('Produce')).not.toBeInTheDocument();
		await expect.element(page.getByText('Uncategorized')).not.toBeInTheDocument();
	});

	it('orders a categories-disabled list by sortOrder, not by leftover categoryId', async () => {
		// These categoryIds are leftover from before the list opted out of
		// categories — interleaved by sortOrder rather than clustered by
		// category, so a bug that groups by categoryId before flattening
		// would clump Apples with Bananas instead of leaving Milk between them.
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11, sortOrder: 1 }),
			makeItem({ id: 102, name: 'Apples', categoryId: 10, sortOrder: 2 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Apples')).toBeInTheDocument();

		const names = [...document.querySelectorAll('li')].map((li) => li.textContent);
		const order = ['Bananas', 'Milk', 'Apples'].map((name) =>
			names.findIndex((text) => text?.includes(name))
		);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it('sorts a categories-disabled list alphabetically when itemSortOrder is alphabetical', async () => {
		vi.mocked(fetchList).mockResolvedValue({
			...list,
			useCategories: false,
			itemSortOrder: 'alphabetical'
		});
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Milk', categoryId: 10, sortOrder: 0 }),
			makeItem({ id: 101, name: 'Apples', categoryId: 11, sortOrder: 1 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Apples')).toBeInTheDocument();

		const names = [...document.querySelectorAll('li')].map((li) => li.textContent);
		const appleIndex = names.findIndex((text) => text?.includes('Apples'));
		const milkIndex = names.findIndex((text) => text?.includes('Milk'));
		expect(appleIndex).toBeLessThan(milkIndex);
	});

	it('renders no groups when a categories-free list has only hidden checked items', async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', checked: true, checkedAt: TS })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Hide checked items' }).click();
		await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
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
		await expect.element(page.getByText('1 of 2 remaining')).toBeInTheDocument();
		await expect.element(page.getByText(/^Total:/)).not.toBeInTheDocument();
	});

	it('shows the done count instead of remaining when that display preference is set', async () => {
		window.localStorage.setItem('everylist:progressDisplay', 'done');
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('1 of 2 done')).toBeInTheDocument();
	});

	it("sorts items alphabetically within a category when itemSortOrder is 'alphabetical'", async () => {
		vi.mocked(fetchList).mockResolvedValue({ ...list, itemSortOrder: 'alphabetical' });
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 }),
			makeItem({ id: 101, name: 'Apples', categoryId: 10, sortOrder: 1 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		const produceHeader = page.getByText('Produce').element().closest('h2');
		expect(produceHeader).not.toBeNull();

		const names = [...produceHeader!.parentElement!.querySelectorAll('li span')]
			.map((el) => el.textContent?.trim())
			.filter((t) => t === 'Bananas' || t === 'Apples');
		expect(names).toEqual(['Apples', 'Bananas']);
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

	it('links Stores directly and List settings via the header menu, with Favorites and Recently Deleted beside the item input', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const favoritesLink = page.getByRole('link', { name: 'Favorites' });
		expect(favoritesLink.element().getAttribute('href')).toBe('/lists/1/favorites');

		const recentLink = page.getByRole('link', { name: 'Recently deleted' });
		expect(recentLink.element().getAttribute('href')).toBe('/lists/1/recently-deleted');

		const storesLink = page.getByRole('link', { name: 'Stores' });
		expect(storesLink.element().getAttribute('href')).toBe('/lists/1/stores');

		// The settings link lives inside the header's vertical-ellipsis menu.
		await page.getByRole('button', { name: 'List menu' }).click();
		const settingsLink = page.getByRole('link', { name: 'List settings' });
		expect(settingsLink.element().getAttribute('href')).toBe('/lists/1/settings');
	});

	it('hides the Stores, Favorites, and Recently deleted links when their list settings are off', async () => {
		vi.mocked(fetchList).mockResolvedValue({
			...list,
			useShops: false,
			useFavorites: false,
			useRecent: false
		});

		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await expect.element(page.getByRole('link', { name: 'Stores' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Favorites' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: 'Recently deleted' }))
			.not.toBeInTheDocument();
	});

	it('collapses the Favorites and Recently Deleted links while the item input is focused', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const leftSlot = page.getByRole('link', { name: 'Favorites' }).element()
			.parentElement as HTMLElement;
		expect(leftSlot.className).toContain('opacity-100');

		await page.getByPlaceholder('Item name').element().focus();

		await expect.poll(() => leftSlot.className).toContain('opacity-0');
		expect(leftSlot.className).toContain('pointer-events-none');
	});

	it('links the clipboard icon to the full-screen paste-import screen when the input is focused', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').element().focus();
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
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

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
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

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
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

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
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
		await expect.poll(() => row().className.includes('item-row-highlight')).toBe(true);

		// Re-matching before the first highlight fades restarts the timer
		// rather than leaving two competing timeouts.
		await input.fill('bananas');
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
		await expect.poll(() => row().className.includes('item-row-highlight')).toBe(true);

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
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

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

	describe('undo (shake-to-undo, PLAN_21_PHASE_SHAKE_TO_UNDO.md)', () => {
		it('shows an undo toast after adding an item, and Undo deletes it back off', async () => {
			vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread' }));

			render(ListDetailPage);
			await page.getByPlaceholder('Item name').fill('Bread');
			page
				.getByPlaceholder('Item name')
				.element()
				.closest('form')
				?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
			await expect.element(page.getByText('Bread')).toBeInTheDocument();
			await expect.element(page.getByText('Item added')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(deleteItem).toHaveBeenCalledWith(1, 200);
			await expect.element(page.getByText('Bread')).not.toBeInTheDocument();
			await expect.element(page.getByText('Item added')).not.toBeInTheDocument();
		});

		it('reloads the list when undoing an add fails without an ApiError', async () => {
			vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread' }));
			vi.mocked(deleteItem).mockRejectedValueOnce(new TypeError('network down'));

			render(ListDetailPage);
			await page.getByPlaceholder('Item name').fill('Bread');
			page
				.getByPlaceholder('Item name')
				.element()
				.closest('form')
				?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
			await expect.element(page.getByText('Bread')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		});

		it('reloads the list when undoing an add fails with an ApiError', async () => {
			vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread' }));
			vi.mocked(deleteItem).mockRejectedValueOnce(new ApiError(500, 'Could not delete'));

			render(ListDetailPage);
			await page.getByPlaceholder('Item name').fill('Bread');
			page
				.getByPlaceholder('Item name')
				.element()
				.closest('form')
				?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
			await expect.element(page.getByText('Bread')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		});

		it('undoing an "add" that actually matched (and unchecked) an existing item re-checks it instead of deleting it', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Milk', categoryId: 10, checked: true })
			]);
			vi.mocked(createItem).mockResolvedValue(
				makeItem({ id: 100, name: 'Milk', categoryId: 10, checked: false })
			);

			render(ListDetailPage);
			await page.getByPlaceholder('Item name').fill('milk');
			page
				.getByPlaceholder('Item name')
				.element()
				.closest('form')
				?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
			await expect.element(page.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(deleteItem).not.toHaveBeenCalled();
			expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: true });
			await expect.element(page.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
		});

		it('shows an undo toast after checking an item, and Undo unchecks it without affecting a sibling item', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
				makeItem({ id: 101, name: 'Bread', categoryId: 10, checked: true })
			]);
			vi.mocked(updateItem).mockResolvedValue(undefined);

			render(ListDetailPage);
			await page.getByRole('checkbox', { name: 'Bananas' }).click();
			await expect.element(page.getByText('Item checked')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: false });
			await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).not.toBeChecked();
			await expect.element(page.getByText('Item checked')).not.toBeInTheDocument();
			// Bread stays checked, proving the map only reverted the undone item.
			await expect.element(page.getByRole('checkbox', { name: 'Bread' })).toBeChecked();
		});

		it('reverses the strike-wipe in place when undoing a check with checked items still shown', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
			]);
			vi.mocked(updateItem).mockResolvedValue(undefined);

			render(ListDetailPage);
			await page.getByRole('checkbox', { name: 'Bananas' }).click();
			await expect.element(page.getByText('Item checked')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			// The item never left the DOM (checked items stay visible by default), so there's
			// nothing to slide in — the reverse strike-wipe plays instead.
			const li = page.getByRole('checkbox', { name: 'Bananas' }).element().closest('li')!;
			expect(li.className).not.toContain('item-return-slide');
			const nameSpan = page.getByText('Bananas').element();
			expect(nameSpan.className).toContain('item-unstrike-wipe');
		});

		it('slides the item back in when undoing a check that had hidden it', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
			]);
			vi.mocked(updateItem).mockResolvedValue(undefined);

			render(ListDetailPage);
			await page.getByRole('button', { name: 'Hide checked items' }).click();
			await page.getByRole('checkbox', { name: 'Bananas' }).click();
			await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.element(page.getByText('Bananas')).toBeInTheDocument();
			const li = page.getByText('Bananas').element().closest('li')!;
			expect(li.className).toContain('item-return-slide');
		});

		it('skips the return animation under prefers-reduced-motion but still undoes the check', async () => {
			const matchMediaSpy = mockReducedMotion();
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
			]);
			vi.mocked(updateItem).mockResolvedValue(undefined);

			render(ListDetailPage);
			await page.getByRole('checkbox', { name: 'Bananas' }).click();
			await expect.element(page.getByText('Item checked')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: false });
			await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).not.toBeChecked();

			matchMediaSpy.mockRestore();
		});

		it('shows an undo toast after unchecking an item, and Undo checks it again', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
			]);
			vi.mocked(updateItem).mockResolvedValue(undefined);

			render(ListDetailPage);
			await page.getByRole('checkbox', { name: 'Bananas' }).click();
			await expect.element(page.getByText('Item unchecked')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: true });
			await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).toBeChecked();
		});

		it('reloads the list when undoing a check/uncheck fails without an ApiError', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
			]);
			vi.mocked(updateItem)
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new TypeError('network down'));

			render(ListDetailPage);
			await page.getByRole('checkbox', { name: 'Bananas' }).click();

			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		});

		it('reloads the list when undoing a check/uncheck fails with an ApiError', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
			]);
			vi.mocked(updateItem)
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new ApiError(500, 'Could not update'));

			render(ListDetailPage);
			await page.getByRole('checkbox', { name: 'Bananas' }).click();

			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		});
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
		// handleAddItem carries its own guard, reachable via a raw 'submit'
		// event and not just Enter on the input.
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

	it('ignores a second submit while an add is still in flight', async () => {
		vi.mocked(createItem).mockReturnValue(new Promise<ItemDto>(() => {}));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const submit = () =>
			page
				.getByPlaceholder('Item name')
				.element()
				.closest('form')
				?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await page.getByPlaceholder('Item name').fill('Bread');
		submit();
		submit();

		expect(createItem).toHaveBeenCalledTimes(1);
	});

	it('shows a generic error message when adding an item fails without an ApiError', async () => {
		vi.mocked(createItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.element(page.getByText('Failed to add item.')).toBeInTheDocument();
	});

	it('shows the ApiError message when adding an item fails', async () => {
		vi.mocked(createItem).mockRejectedValue(new ApiError(422, 'Duplicate item'));

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		page
			.getByPlaceholder('Item name')
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

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

	it('shows a note on its own line under the item, and none for an item without one', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, notes: 'get the ripe ones' }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, notes: null })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('get the ripe ones')).toBeInTheDocument();
		const breadRow = page.getByText('Bread').element().closest('li') as HTMLElement;
		expect(breadRow.textContent).not.toContain('get the ripe ones');
	});

	it("renders a URL inside a note as a clickable link, leaving the rest of the note's text and spacing intact", async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({
				id: 100,
				name: 'Bananas',
				categoryId: 10,
				notes: 'see https://example.com/recipe for the recipe'
			})
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas', { exact: true })).toBeInTheDocument();
		const bananasRow = page
			.getByText('Bananas', { exact: true })
			.element()
			.closest('li') as HTMLElement;
		const noteEl = bananasRow.querySelector('p') as HTMLElement;
		expect(noteEl.textContent).toBe('see https://example.com/recipe for the recipe');

		const link = page.getByRole('link', { name: 'https://example.com/recipe' });
		expect(link.element().getAttribute('href')).toBe('https://example.com/recipe');
		expect(link.element().getAttribute('target')).toBe('_blank');

		await link.click();

		expect(openExternalLink).toHaveBeenCalledWith(
			'https://example.com/recipe',
			expect.any(MouseEvent)
		);
		// Clicking the link must not be misread as a tap on the row itself.
		expect(updateItem).not.toHaveBeenCalled();
		expect(deleteItem).not.toHaveBeenCalled();
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 20,
			filter: 'store'
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement;
		const colorSpan = storesLink.querySelector('span') as HTMLElement;
		expect(colorSpan.style.color).toBe('rgb(59, 130, 246)');
	});

	it('long-presses the store icon to quick-select a store, persisting the choice and applying its aisle order', async () => {
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({ storeId: null, filter: 'store' });
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 10, sortOrder: 5, deletedAt: null, version: 1 }
		]);

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement & {
			__onLongPress?: () => void;
		};
		storesLink.__onLongPress?.();

		await page.getByRole('button', { name: 'Corner Shop' }).click();

		expect(setSelectedStoreSettings).toHaveBeenCalledWith(1, { storeId: 20, filter: 'store' });
		expect(fetchStoreCategoryOrder).toHaveBeenCalledWith(20);
		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).not.toBeInTheDocument();
	});

	it('clears the selected store from the quick switcher via "No store selected"', async () => {
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({ storeId: 20, filter: 'store' });

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement & {
			__onLongPress?: () => void;
		};
		storesLink.__onLongPress?.();

		await page.getByRole('button', { name: 'No store selected' }).click();

		expect(setSelectedStoreSettings).toHaveBeenCalledWith(1, { storeId: null, filter: 'store' });
	});

	it('closes the store quick switcher when clicking outside it', async () => {
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

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement & {
			__onLongPress?: () => void;
		};
		storesLink.__onLongPress?.();
		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).toBeInTheDocument();

		await page.getByRole('heading', { name: 'Groceries' }).click();

		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).not.toBeInTheDocument();
	});

	it('closes the store quick switcher on Escape', async () => {
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

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		// Escape while the menu is still closed is a no-op.
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement & {
			__onLongPress?: () => void;
		};
		storesLink.__onLongPress?.();
		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).toBeInTheDocument();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).not.toBeInTheDocument();
	});

	it('keeps the quick switcher open when a click lands inside its panel', async () => {
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

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement & {
			__onLongPress?: () => void;
		};
		storesLink.__onLongPress?.();
		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).toBeInTheDocument();
		const menuItem = page.getByRole('button', { name: 'Corner Shop' }).element();

		// Clicking the panel (not a menu item, and not the navigating store
		// icon) must not be treated as a click-outside.
		menuItem.parentElement!.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true })
		);

		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).toBeInTheDocument();
	});

	it('re-selecting the already-selected store from the quick switcher is a no-op', async () => {
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({ storeId: 20, filter: 'store' });

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
		// The aisle order is fetched once during loadAll for the already-selected store.
		expect(fetchStoreCategoryOrder).toHaveBeenCalledWith(20);

		const storesLink = page.getByRole('link', { name: 'Stores' }).element() as HTMLElement & {
			__onLongPress?: () => void;
		};
		storesLink.__onLongPress?.();
		await page.getByRole('button', { name: 'Corner Shop' }).click();

		expect(setSelectedStoreSettings).not.toHaveBeenCalled();
		expect(fetchStoreCategoryOrder).toHaveBeenCalledTimes(1);
		await expect.element(page.getByRole('button', { name: 'Corner Shop' })).not.toBeInTheDocument();
	});

	it('prevents the browser context menu on a long-press of the store icon', async () => {
		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		const storesLink = page.getByRole('link', { name: 'Stores' }).element();
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		storesLink.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it('toggles one item checked without affecting a sibling item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('2 of 2 remaining')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: true });
		await expect.element(page.getByText('1 of 2 remaining')).toBeInTheDocument();
		// Bread stays unchecked, proving the map only updates the toggled item.
		await expect.element(page.getByRole('checkbox', { name: 'Bread' })).not.toBeChecked();
		expect(refreshBadgeCount).toHaveBeenCalled();
	});

	it('shows the animated strike wipe right after checking an item, then the steady line-through once it finishes', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		const nameSpan = page.getByText('Bananas').element();
		expect(nameSpan.className).toContain('item-strike-wipe');

		await expect.poll(() => nameSpan.className, { timeout: 1000 }).toContain('line-through');
		expect(nameSpan.className).not.toContain('item-strike-wipe');
	});

	it('skips the check-off animation delay under prefers-reduced-motion, hiding a checked item immediately', async () => {
		const matchMediaSpy = mockReducedMotion();
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Hide checked items' }).click();
		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		// No animation delay to wait out — the row (and the now-repositioned
		// Bread row below it) is gone on the very next render.
		await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		matchMediaSpy.mockRestore();
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 20,
			filter: 'store'
		});
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).not.toBeInTheDocument();
	});

	it('keeps unassigned items visible alongside the selected store when the "show unassigned" option is on', async () => {
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 20,
			filter: 'storeAndUnassigned'
		});
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null }),
			makeItem({ id: 102, name: 'Milk', categoryId: 10, storeId: 21 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).not.toBeInTheDocument();
	});

	it('shows every item, in the selected store\'s aisle order, when the filter is "all"', async () => {
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 20,
			filter: 'all'
		});
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 10, sortOrder: 5, deletedAt: null, version: 1 },
			{ id: 2, storeId: 20, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 }
		]);
		// Three items tagged three different ways (the selected store, no store,
		// and a different store) — all must remain visible under "all".
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: 20 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: null }),
			makeItem({ id: 102, name: 'Milk', categoryId: 11, storeId: 21 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		// The selected store's aisle order still applies: Dairy (override 0)
		// precedes Produce (override 5), the reverse of their default order.
		const headings = document.querySelectorAll('h2');
		const headingTexts = [...headings].map((h) => h.textContent?.trim());
		const dairyIndex = headingTexts.findIndex((t) => t === 'Dairy');
		const produceIndex = headingTexts.findIndex((t) => t === 'Produce');
		expect(dairyIndex).toBeGreaterThanOrEqual(0);
		expect(produceIndex).toBeGreaterThan(dairyIndex);
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 20,
			filter: 'store'
		});
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

	it('regression: shows every item, not none, when the locally-selected store no longer exists on this list', async () => {
		// Reproduces a real bug: a stale/orphaned selectedStoreId (e.g. the store
		// was removed some other way than the normal "Remove" flow, or is left
		// over from stale local storage) used to still filter against, silently
		// hiding every item with no filter UI left to clear it from this screen.
		// An id that doesn't resolve to a real, currently-loaded store must be
		// treated exactly like "no store selected."
		vi.mocked(fetchStores).mockResolvedValue([]);
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: 999,
			filter: 'store'
		});
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, storeId: null }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10, storeId: 5 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect
			.element(page.getByText('No items match the currently selected store.'))
			.not.toBeInTheDocument();
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
		vi.mocked(getSelectedStoreSettings).mockResolvedValue({
			storeId: null,
			filter: 'store'
		});
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

	it('shows a formatted price on each item row that has one set', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, price: 399 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('$3.99', { exact: true })).toBeInTheDocument();
		// An item without a price renders no price — nothing to show, and no $0.00.
		await expect.element(page.getByText('$0.00', { exact: true })).not.toBeInTheDocument();
	});

	it('reloads the list when toggling checked fails without an ApiError', async () => {
		// toggleChecked's catch sets `error` and immediately triggers a reload via
		// loadAll(), whose own successful completion clears `error` back to null —
		// so the message set here is never the visible end state; what's
		// observable is the reload itself.
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

	describe('undo-delete toast', () => {
		it('shows an undo toast after deleting an item, and Undo restores it at its original position', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 }),
				makeItem({ id: 101, name: 'Milk', categoryId: 10, sortOrder: 1 })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Bananas' }).click();

			expect(deleteItem).toHaveBeenCalledWith(1, 100);
			await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
			await expect.element(page.getByText('Item deleted')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(undoDeleteItem).toHaveBeenCalledWith(1, 100);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();
			await expect.element(page.getByText('Item deleted')).not.toBeInTheDocument();

			const produceHeader = page.getByText('Produce').element().closest('h2');
			const names = [...produceHeader!.parentElement!.querySelectorAll('li span')]
				.map((el) => el.textContent?.trim())
				.filter((t) => t === 'Bananas' || t === 'Milk');
			expect(names).toEqual(['Bananas', 'Milk']);
		});

		it('lets the deletion stand once the toast times out without Undo', async () => {
			vi.useFakeTimers();
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Bananas' }).click();
			await expect.element(page.getByText('Item deleted')).toBeInTheDocument();

			await vi.advanceTimersByTimeAsync(5000);

			await expect.element(page.getByText('Item deleted')).not.toBeInTheDocument();
			await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
			expect(undoDeleteItem).not.toHaveBeenCalled();
		});

		it('replaces an active toast when a second item is deleted before Undo', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 }),
				makeItem({ id: 101, name: 'Milk', categoryId: 10, sortOrder: 1 })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Bananas' }).click();
			await expect.element(page.getByText('Item deleted')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Milk' }).click();
			await expect.element(page.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(undoDeleteItem).toHaveBeenCalledExactlyOnceWith(1, 101);
			await expect.element(page.getByText('Milk')).toBeInTheDocument();
			await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
		});

		it('reloads the list when undoing a delete fails without an ApiError', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 })
			]);
			vi.mocked(undoDeleteItem).mockRejectedValue(new TypeError('network down'));

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Bananas' }).click();
			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		});

		it('reloads the list when undoing a delete fails with an ApiError', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 })
			]);
			vi.mocked(undoDeleteItem).mockRejectedValue(new ApiError(500, 'Could not undo delete'));

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Bananas' }).click();
			await page.getByRole('button', { name: 'Undo' }).click();

			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		});

		it("doesn't duplicate the item if the original delete already self-healed via a reload before Undo is clicked", async () => {
			// `deleteItem` fails independently of the toast, so `removeItem`'s own
			// catch reloads the list — since `fetchItems` keeps resolving with
			// Bananas still present, that reload alone already puts it back into
			// `items` before Undo is ever clicked.
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, sortOrder: 0 })
			]);
			vi.mocked(deleteItem).mockRejectedValueOnce(new ApiError(500, 'Could not delete'));

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Delete Bananas' }).click();
			await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Undo' }).click();

			expect(undoDeleteItem).toHaveBeenCalledWith(1, 100);
			await expect.element(page.getByText('Item deleted')).not.toBeInTheDocument();
			expect(page.getByText('Bananas').elements()).toHaveLength(1);
		});
	});

	it('disables "Clear Checked Off Items" in the menu until at least one item is checked', async () => {
		vi.mocked(updateItem).mockResolvedValue(undefined);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Clear checked off items' }))
			.toBeDisabled();
		await page.getByRole('button', { name: 'List menu' }).click();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		await page.getByRole('button', { name: 'List menu' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Clear checked off items' }))
			.toBeEnabled();
	});

	it('asks for confirmation before clearing checked items, then clears them on confirm', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true }),
			makeItem({ id: 101, name: 'Milk', categoryId: 10, checked: true }),
			makeItem({ id: 102, name: 'Bread', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Clear checked off items' }).click();

		await expect.element(page.getByText('Clear 2 checked items?')).toBeInTheDocument();
		expect(deleteItem).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect.poll(() => vi.mocked(deleteItem).mock.calls.length).toBe(2);
		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		expect(deleteItem).toHaveBeenCalledWith(1, 101);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).not.toBeInTheDocument();
		await expect.element(page.getByText('Milk')).not.toBeInTheDocument();
	});

	it('cancels the clear-checked confirmation without deleting anything', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Clear checked off items' }).click();
		await expect.element(page.getByText('Clear 1 checked item?')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByText('Clear 1 checked item?')).not.toBeInTheDocument();
		expect(deleteItem).not.toHaveBeenCalled();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('asks for confirmation before unchecking all items, then unchecks every checked item on confirm', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true }),
			makeItem({ id: 101, name: 'Milk', categoryId: 10, checked: true }),
			makeItem({ id: 102, name: 'Bread', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Uncheck all items' }).click();

		await expect.element(page.getByText('Uncheck all 2 items?')).toBeInTheDocument();
		expect(updateItem).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(2);
		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: false });
		expect(updateItem).toHaveBeenCalledWith(1, 101, { checked: false });
		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).not.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'Bread' })).not.toBeChecked();
		// Already-unchecked items are left untouched by the bulk uncheck.
		expect(updateItem).not.toHaveBeenCalledWith(1, 102, expect.anything());
	});

	it('cancels the uncheck-all confirmation without updating anything', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Uncheck all items' }).click();
		await expect.element(page.getByText('Uncheck 1 item?')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByText('Uncheck 1 item?')).not.toBeInTheDocument();
		expect(updateItem).not.toHaveBeenCalled();
		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).toBeChecked();
	});

	it('disables "Clear ALL List Items" in the menu when the list has no items', async () => {
		vi.mocked(fetchItems).mockResolvedValue([]);

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await expect.element(page.getByRole('button', { name: 'Clear all list items' })).toBeDisabled();
	});

	it('asks for confirmation before clearing all list items, then deletes every item on confirm', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true }),
			makeItem({ id: 101, name: 'Milk', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Clear all list items' }).click();

		await expect.element(page.getByText('Clear all 2 items?')).toBeInTheDocument();
		expect(deleteItem).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect.poll(() => vi.mocked(deleteItem).mock.calls.length).toBe(2);
		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		expect(deleteItem).toHaveBeenCalledWith(1, 101);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
	});

	it('cancels the clear-all confirmation without deleting anything', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Clear all list items' }).click();
		await expect.element(page.getByText('Clear all 1 item?')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByText('Clear all 1 item?')).not.toBeInTheDocument();
		expect(deleteItem).not.toHaveBeenCalled();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('dismisses the confirmation when clicking outside the dialog, but not on a click inside it', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Clear all list items' }).click();
		await expect.element(page.getByText('Clear all 1 item?')).toBeInTheDocument();

		// The outside-click listener attaches a tick after the dialog opens (see
		// +page.svelte) so the same click that opened it can't also close it.
		await new Promise((resolve) => setTimeout(resolve, 0));

		const dialogMessage = page.getByText('Clear all 1 item?').element();
		dialogMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await expect.element(page.getByText('Clear all 1 item?')).toBeInTheDocument();

		const overlay = dialogMessage.closest('[role="alertdialog"]')!.parentElement!;
		overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		await expect.element(page.getByText('Clear all 1 item?')).not.toBeInTheDocument();
		expect(deleteItem).not.toHaveBeenCalled();
	});

	it('dismisses the confirmation on Escape, ignoring other keys', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Clear all list items' }).click();
		await expect.element(page.getByText('Clear all 1 item?')).toBeInTheDocument();

		await new Promise((resolve) => setTimeout(resolve, 0));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await expect.element(page.getByText('Clear all 1 item?')).toBeInTheDocument();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.element(page.getByText('Clear all 1 item?')).not.toBeInTheDocument();
		expect(deleteItem).not.toHaveBeenCalled();
	});

	describe('Share submenu', () => {
		it('prints the list from the Share submenu, without navigating away', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);
			const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Print list' }).click();

			await expect.poll(() => printSpy.mock.calls.length).toBe(1);
			expect(goto).not.toHaveBeenCalled();
			printSpy.mockRestore();
		});

		it('copies the list to the clipboard in AnyList format', async () => {
			// Includes a second Produce item (exercises the "category bucket
			// already exists" path in buildShareText) and a third, itemless
			// category (exercises its "no bucket for this category" fallback).
			const bakery = { ...produce, id: 12, name: 'Bakery', sortOrder: 2 };
			vi.mocked(fetchCategories).mockResolvedValue([produce, dairy, bakery]);
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false, quantity: '2' }),
				makeItem({ id: 104, name: 'Apples', categoryId: 10, checked: false }),
				makeItem({ id: 101, name: 'Milk', categoryId: 11, checked: false }),
				makeItem({ id: 103, name: 'Old Bread', categoryId: 10, checked: true })
			]);
			const writeText = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Copy to Clipboard' }).click();

			await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
			expect(writeText).toHaveBeenCalledWith(
				'Groceries\n\nPRODUCE\n• Bananas (2)\n• Apples\n\nDAIRY\n• Milk'
			);

			// A second click while the "Copied!" flash is still armed exercises
			// re-arming the timeout (clearing the previous one) rather than a
			// fresh one racing it.
			await page.getByRole('button', { name: 'Copied!' }).click();
			await expect.poll(() => writeText.mock.calls.length).toBe(2);
		});

		it('copies a categories-disabled list to the clipboard as one flat section', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false }),
				makeItem({ id: 101, name: 'Milk', categoryId: 11, checked: true })
			]);
			const writeText = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Copy to Clipboard' }).click();

			await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
			expect(writeText).toHaveBeenCalledWith('Groceries\n\n• Bananas');
		});

		it('copies an alphabetical-sort list to the clipboard sorted by name within each category', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, itemSortOrder: 'alphabetical' });
			vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false }),
				makeItem({ id: 104, name: 'Apples', categoryId: 10, checked: false }),
				makeItem({ id: 101, name: 'Milk', categoryId: 11, checked: false })
			]);
			const writeText = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Copy to Clipboard' }).click();

			await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
			expect(writeText).toHaveBeenCalledWith(
				'Groceries\n\nPRODUCE\n• Apples\n• Bananas\n\nDAIRY\n• Milk'
			);
		});

		it('omits quantity from the copied text when the list opts out of quantity', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, useQuantity: false });
			vi.mocked(fetchCategories).mockResolvedValue([produce]);
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false, quantity: '2' })
			]);
			const writeText = vi.fn().mockResolvedValue(undefined);
			vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Copy to Clipboard' }).click();

			await expect.element(page.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
			expect(writeText).toHaveBeenCalledWith('Groceries\n\nPRODUCE\n• Bananas');
		});

		it('sends an email export from the Share submenu', async () => {
			vi.mocked(emailExportList).mockResolvedValue(undefined);
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Email export…' }).click();
			await page.getByPlaceholder('you@example.com').fill('friend@example.com');
			await page.getByRole('button', { name: 'Send' }).click();

			expect(emailExportList).toHaveBeenCalledWith(1, 'friend@example.com');
			await expect.element(page.getByText('Export sent.')).toBeInTheDocument();
		});

		it('shows the ApiError message when the email export fails', async () => {
			vi.mocked(emailExportList).mockRejectedValue(
				new ApiError(503, 'Email export is not configured on this server.')
			);
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Email export…' }).click();
			await page.getByPlaceholder('you@example.com').fill('friend@example.com');
			await page.getByRole('button', { name: 'Send' }).click();

			await expect
				.element(page.getByText('Email export is not configured on this server.'))
				.toBeInTheDocument();
		});

		it('shows a generic error message when the email export fails without an ApiError', async () => {
			vi.mocked(emailExportList).mockRejectedValue(new TypeError('network down'));
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Email export…' }).click();
			await page.getByPlaceholder('you@example.com').fill('friend@example.com');
			await page.getByRole('button', { name: 'Send' }).click();

			await expect.element(page.getByText('Failed to send export.')).toBeInTheDocument();
		});

		it('does not submit the Share submenu email export form with only whitespace', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Email export…' }).click();

			const input = page.getByPlaceholder('you@example.com');
			const form = input.element().closest('form');
			await input.fill('   ');
			form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

			expect(emailExportList).not.toHaveBeenCalled();
		});

		it('cancels the email export form from the Share submenu', async () => {
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await page.getByRole('button', { name: 'Email export…' }).click();

			await page.getByRole('button', { name: 'Cancel', exact: true }).click();

			await expect.element(page.getByRole('button', { name: 'Email export…' })).toBeInTheDocument();
			expect(emailExportList).not.toHaveBeenCalled();
		});

		it('returns to the main menu from the Share submenu', async () => {
			vi.mocked(fetchItems).mockResolvedValue([]);

			render(ListDetailPage);
			await expect
				.element(page.getByText('Nothing here yet. Add your first item above.'))
				.toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await page.getByRole('button', { name: 'Share' }).click();
			await expect.element(page.getByRole('button', { name: 'Print list' })).toBeInTheDocument();

			await page.getByRole('button', { name: 'Back to list menu' }).click();

			await expect.element(page.getByRole('button', { name: 'Share' })).toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Clear checked off items' }))
				.toBeInTheDocument();
		});
	});

	it('reloads the list when unchecking all items fails', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Uncheck all items' }).click();
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('reloads the list when unchecking all items fails with an ApiError', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);
		vi.mocked(updateItem).mockRejectedValue(new ApiError(500, 'Could not update'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'List menu' }).click();
		await page.getByRole('button', { name: 'Uncheck all items' }).click();
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	// Invokes the onDrop handler SortableJS would have called on a real drop,
	// via the test double registered above — the item-list page hands the
	// same onDrop callback to every category `<ul>`, so it doesn't matter
	// which one's DOM node we read it off.
	function triggerDrop(params: {
		itemId: number;
		toContainerId: number | null;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const ul = document.querySelector('ul[data-container-id]') as HTMLElement & {
			__onDrop?: (p: typeof params) => void;
		};
		ul.__onDrop?.(params);
	}

	it('reorders two items within the same category by dragging', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		triggerDrop({ itemId: 100, toContainerId: 10, beforeItemId: 101, afterItemId: null });

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

		triggerDrop({ itemId: 100, toContainerId: 11, beforeItemId: 101, afterItemId: null });

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

		// Carrots lands between Bananas and Bread — the insertion point is
		// computed from its real new neighbors, not a flat position.
		triggerDrop({ itemId: 102, toContainerId: 10, beforeItemId: 100, afterItemId: 101 });

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 102, expect.objectContaining({ categoryId: 10 }));
	});

	it('reorders an item to the start of a category, ahead of the current first item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		// No before neighbor at all — Bread becomes the sole after-neighbor.
		triggerDrop({ itemId: 100, toContainerId: 10, beforeItemId: null, afterItemId: 101 });

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: 10 }));
	});

	it("preserves an item's leftover categoryId when dragged in a categories-disabled list", async () => {
		// The single flat section's container id is always null (see
		// data-container-id in the template), so a drop handler that blindly
		// assigns toContainerId would clear this item's leftover categoryId
		// on every drag even though categories are disabled.
		vi.mocked(fetchList).mockResolvedValue({ ...list, useCategories: false });
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		triggerDrop({ itemId: 100, toContainerId: null, beforeItemId: 101, afterItemId: null });

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: 10 }));
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

		triggerDrop({ itemId: 100, toContainerId: null, beforeItemId: 101, afterItemId: null });

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: null }));
	});

	it('places the item alone when its new section has no other items', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		// No before/after neighbor at all — insertAt falls back to the end of
		// the (otherwise-empty, from this item's perspective) destination.
		triggerDrop({ itemId: 100, toContainerId: 11, beforeItemId: null, afterItemId: null });

		await expect.poll(() => vi.mocked(updateItem).mock.calls.length).toBe(1);
		expect(updateItem).toHaveBeenCalledWith(1, 100, expect.objectContaining({ categoryId: 11 }));
	});

	it('reloads the list when reordering an item fails without an ApiError', async () => {
		// reordering's catch, like toggleChecked's, sets `error` and then reloads
		// — loadAll()'s own successful completion clears `error` back to null, so
		// the observable effect is the reload itself.
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		triggerDrop({ itemId: 100, toContainerId: 10, beforeItemId: 101, afterItemId: null });

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

		triggerDrop({ itemId: 100, toContainerId: 10, beforeItemId: 101, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
	});

	it('reloads the list when removing an item fails without an ApiError', async () => {
		// removeItem's catch, like toggleChecked's, sets `error` and then reloads
		// — loadAll()'s own successful completion clears `error` back to null, so
		// the observable effect is the reload itself.
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

	function mockReducedMotion() {
		return vi.spyOn(window, 'matchMedia').mockImplementation(
			(query: string) =>
				({
					matches: query.includes('reduced-motion'),
					media: query,
					onchange: null,
					addListener: vi.fn(),
					removeListener: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					dispatchEvent: vi.fn()
				}) as unknown as MediaQueryList
		);
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

	it('marks the list as the navigation origin when the desktop edit link is clicked', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		// Same capture-phase guard as PageHeader.svelte.spec.ts's back-link
		// test — this is a real same-origin <a href>, and SvelteKit's own
		// document-level router (live in this test environment) would
		// otherwise navigate the iframe away, risking flakiness in other
		// concurrently running test files.
		const link = page.getByRole('link', { name: 'Edit Bananas' }).element();
		const preventNav = (event: Event) => event.preventDefault();
		document.addEventListener('click', preventNav, { capture: true });
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		document.removeEventListener('click', preventNav, { capture: true });

		expect(consumeListOrigin()).toBe(true);
	});

	it('restores a remembered scroll position once the list has reloaded', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		rememberListScroll(1, 400);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await expect.poll(() => scrollToSpy.mock.calls.length).toBeGreaterThan(0);
		expect(scrollToSpy).toHaveBeenCalledWith(0, 400);

		scrollToSpy.mockRestore();
	});

	it('leaves scroll alone when nothing was remembered for this list', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		expect(scrollToSpy).not.toHaveBeenCalled();

		scrollToSpy.mockRestore();
	});

	it('toggles checked on a short tap anywhere on the row on a coarse-pointer device', async () => {
		const matchMediaSpy = mockCoarsePointer();
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).not.toBeChecked();

		// Tap on the item name, not the checkbox itself — the row is the
		// touch target now, not just the small checkbox glyph.
		const row = page
			.getByText('Bananas')
			.element()
			.closest('li')!
			.querySelector(':scope > div:last-of-type') as HTMLElement;
		row.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		row.dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);

		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).toBeChecked();
		expect(deleteItem).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();

		matchMediaSpy.mockRestore();
	});

	it('does not double-toggle when the tap lands directly on the checkbox on a coarse-pointer device', async () => {
		const matchMediaSpy = mockCoarsePointer();
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);
		vi.mocked(updateItem).mockResolvedValue(undefined);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		await expect.element(page.getByRole('checkbox', { name: 'Bananas' })).toBeChecked();
		expect(vi.mocked(updateItem).mock.calls.length).toBe(1);

		matchMediaSpy.mockRestore();
	});

	it('subscribes to the list channel and silently refreshes on a non-dirty sync event', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();
		expect(subscribeToList).toHaveBeenCalledWith(1, expect.any(Function));

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null, version: 1 });
		// The "This list was updated" toast was removed (PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md) — the
		// event now drives a silent re-load of the list.
		await expect.poll(() => vi.mocked(fetchList).mock.calls.length).toBe(2);
	});

	it('keeps the item list mounted (no scroll-resetting remount) across a realtime refresh', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		const rowBefore = page.getByText('Bananas').element();

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null, version: 1 });
		await expect.poll(() => vi.mocked(fetchList).mock.calls.length).toBe(2);

		// loadAll() only shows the "Loading…" placeholder — which tears down and
		// rebuilds the whole keyed item list, resetting scroll — before `list`
		// exists. A silent background refresh must reuse the same DOM node
		// instead, so an already-mounted row's element identity survives it.
		await expect.element(page.getByText('Loading…')).not.toBeInTheDocument();
		expect(page.getByText('Bananas').element()).toBe(rowBefore);
	});

	it('suppresses the refresh for an entity this client just mutated', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});
		markSelfMutation('item', 1);

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ entityType: 'item', entityId: 1, op: 'update', payload: null, version: 2 });
		// Give the handler a beat — our own edit's broadcast must not reload.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fetchList).toHaveBeenCalledTimes(1);
	});

	it('silently refreshes when the offline flush loop reconciles a conflict', async () => {
		let handler: ConflictListener = () => {};
		vi.mocked(onConflict).mockImplementation((listener) => {
			handler = listener ?? (() => {});
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({} as Parameters<ConflictListener>[0]);
		await expect.poll(() => vi.mocked(fetchList).mock.calls.length).toBe(2);
	});

	it('silently refreshes once the flush loop drains its own queued offline edits', async () => {
		let handler: FlushOutcomeListener = () => {};
		vi.mocked(onFlushOutcome).mockImplementation((listener) => {
			handler = listener ?? (() => {});
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ ok: true });
		await expect.poll(() => vi.mocked(fetchList).mock.calls.length).toBe(2);
	});

	it('does not refresh when a flush drain aborts on a network error', async () => {
		let handler: FlushOutcomeListener = () => {};
		vi.mocked(onFlushOutcome).mockImplementation((listener) => {
			handler = listener ?? (() => {});
			return vi.fn();
		});

		render(ListDetailPage);
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		handler({ ok: false });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fetchList).toHaveBeenCalledTimes(1);
	});

	it('suppresses the refresh for a row with an unacked local edit', async () => {
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
		// Give isRowDirty's async resolution a beat — the unacked edit means no reload.
		await new Promise((resolve) => setTimeout(resolve, 0));
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
		await page.getByRole('button', { name: 'List menu' }).click();
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

	it('re-locks the list on a later visit after leaving it', async () => {
		const { buildPasscodeHash } = await import('$lib/passcode');
		const passcodeHash = await buildPasscodeHash('1234');
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash });

		const { unmount } = render(ListDetailPage);
		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();
		await page.getByLabelText('Passcode').fill('1234');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		// Leaving the list (unmounting the page) and coming back later must not
		// remember the unlock — unlike list-scoped display prefs, this is an
		// access gate, not persisted anywhere.
		unmount();
		render(ListDetailPage);

		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();
	});

	it('re-locks the list when the tab is sent to the background', async () => {
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

		Object.defineProperty(document, 'hidden', { value: true, configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));

		await expect.element(page.getByText('This list is locked')).toBeInTheDocument();
		Object.defineProperty(document, 'hidden', { value: false, configurable: true });
	});

	it('stays unlocked on a visibilitychange while the tab is still visible', async () => {
		const { buildPasscodeHash } = await import('$lib/passcode');
		const passcodeHash = await buildPasscodeHash('1234');
		vi.mocked(fetchList).mockResolvedValue({ ...list, passcodeHash });

		render(ListDetailPage);
		await page.getByLabelText('Passcode').fill('1234');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect
			.element(page.getByText('Nothing here yet. Add your first item above.'))
			.toBeInTheDocument();

		document.dispatchEvent(new Event('visibilitychange'));

		await expect.element(page.getByText('This list is locked')).not.toBeInTheDocument();
	});

	describe('viewer role', () => {
		it('does not toggle a checked item, since the server would reject it as a viewer anyway', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, role: 'viewer' });
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: false })
			]);

			render(ListDetailPage);
			const checkbox = page.getByRole('checkbox', { name: 'Bananas' });
			await expect.element(checkbox).toHaveAttribute('aria-disabled', 'true');
			await expect
				.element(checkbox)
				.toHaveAttribute('title', 'You have view-only access to this list');
			await expect
				.element(
					page.getByText(
						'You have view-only access to this list — checking off, adding, and deleting items is turned off.'
					)
				)
				.toBeInTheDocument();

			// aria-disabled (not the native `disabled` attribute — see the component's own comment
			// on why) still blocks Playwright's normal actionability check, so `force` is needed to
			// simulate the click actually reaching the handler and exercise its own `isViewer`
			// guard, same as a stray keyboard/assistive-tech interaction might.
			await checkbox.click({ force: true });

			expect(updateItem).not.toHaveBeenCalled();
			await expect.element(checkbox).not.toBeChecked();
		});

		it('shows a checked item as a filled grey box (not the normal green) so its state stays legible without hover', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, role: 'viewer' });
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
			]);

			render(ListDetailPage);
			const checkbox = page.getByRole('checkbox', { name: 'Bananas' });
			await expect.element(checkbox).toBeChecked();
			await expect.element(checkbox).toHaveClass(/bg-gray-400/);
			await expect.element(checkbox).not.toHaveClass(/bg-signal/);
		});

		it('hides the add-item form', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, role: 'viewer' });
			vi.mocked(fetchItems).mockResolvedValue([]);

			render(ListDetailPage);
			await expect
				.element(page.getByText('Nothing here yet. Add your first item above.'))
				.toBeInTheDocument();

			await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
		});

		it('hides the per-item Edit and Delete controls', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, role: 'viewer' });
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await expect
				.element(page.getByRole('link', { name: 'Edit Bananas' }))
				.not.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Delete Bananas' }))
				.not.toBeInTheDocument();
		});

		it('disables the bulk checked-item actions in the overflow menu even when items are checked', async () => {
			vi.mocked(fetchList).mockResolvedValue({ ...list, role: 'viewer' });
			vi.mocked(fetchItems).mockResolvedValue([
				makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
			]);

			render(ListDetailPage);
			await expect.element(page.getByText('Bananas')).toBeInTheDocument();

			await page.getByRole('button', { name: 'List menu' }).click();
			await expect
				.element(page.getByRole('button', { name: 'Clear checked off items' }))
				.toBeDisabled();
			await expect.element(page.getByRole('button', { name: 'Uncheck all items' })).toBeDisabled();
			await expect
				.element(page.getByRole('button', { name: 'Clear all list items' }))
				.toBeDisabled();

			expect(deleteItem).not.toHaveBeenCalled();
			expect(updateItem).not.toHaveBeenCalled();
		});
	});

	describe('open item limit (PLAN_25)', () => {
		function mountWithLimit(maxUncheckedItems: number | null, items?: ItemDto[]) {
			vi.mocked(fetchList).mockResolvedValue({ ...list, maxUncheckedItems, role: 'owner' });
			vi.mocked(fetchItems).mockResolvedValue(
				items ?? [
					makeItem({ id: 1, name: 'Bread' }),
					makeItem({ id: 2, name: 'Eggs', checked: true, checkedAt: TS })
				]
			);
		}

		it('shows the open/limit counter in the bottom bar when the list has a limit, and no counter when it does not', async () => {
			mountWithLimit(5);
			render(ListDetailPage);

			// One unchecked item (Bread) out of 5 allowed.
			await expect.element(page.getByLabelText('1 of 5 open items allowed')).toBeInTheDocument();
			await expect
				.element(page.getByLabelText('1 of 5 open items allowed'))
				.toHaveTextContent('1/5');
		});

		it('omits the counter entirely when the list has no limit', async () => {
			mountWithLimit(null);
			render(ListDetailPage);

			await expect.element(page.getByText('1 of 2 remaining')).toBeInTheDocument();
			await expect.element(page.getByLabelText(/open items allowed/)).not.toBeInTheDocument();
		});

		it('styles the counter amber and disables the add input once the list is at its limit', async () => {
			mountWithLimit(2, [makeItem({ id: 1, name: 'Bread' }), makeItem({ id: 2, name: 'Eggs' })]);
			render(ListDetailPage);

			// Two unchecked items against a limit of 2: the counter reads 2/2 and the
			// input is disabled so no further add can even be attempted from the UI.
			const counter = page.getByLabelText('2 of 2 open items allowed');
			await expect.element(counter).toBeInTheDocument();
			await expect.element(page.getByPlaceholder('Item name')).toBeDisabled();
			expect(createItem).not.toHaveBeenCalled();
		});

		it('blocks a submit that slips past the disabled input with the limit message (defense-in-depth)', async () => {
			mountWithLimit(2, [makeItem({ id: 1, name: 'Bread' }), makeItem({ id: 2, name: 'Eggs' })]);
			render(ListDetailPage);
			await expect.element(page.getByPlaceholder('Item name')).toBeDisabled();

			// At the limit the input is disabled, so a real submit can't be typed —
			// drive the form event directly to reach the guard (mirrors the isViewer
			// guard's own unreachable-branch rationale).
			const input = page.getByPlaceholder('Item name').element() as HTMLInputElement;
			const form = input.closest('form')!;
			form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

			await expect
				.element(
					page.getByText('This list allows at most 2 open items — check one off to add more.')
				)
				.toBeInTheDocument();
			expect(createItem).not.toHaveBeenCalled();
		});

		it("shows a toast when the flush loop severs one of this list's queued adds, and stays quiet for other lists", async () => {
			let rejectedListener: ((event: unknown) => void) | undefined;
			vi.mocked(onCreateRejected).mockImplementation((listener) => {
				rejectedListener = listener as (event: unknown) => void;
				return vi.fn();
			});
			mountWithLimit(null);
			render(ListDetailPage);
			await expect.element(page.getByText('1 of 2 remaining')).toBeInTheDocument();

			// Another list's rejection is ignored.
			rejectedListener!({
				entityType: 'item',
				name: 'Milk',
				listId: 999,
				message: 'This list allows only 1 open item — check it off to add more.'
			});
			await expect.element(page.getByText(/wasn't added/)).not.toBeInTheDocument();

			rejectedListener!({
				entityType: 'item',
				name: 'Milk',
				listId: 1,
				message: 'This list allows only 1 open item — check it off to add more.'
			});
			await expect
				.element(
					page.getByText(
						"Milk wasn't added — This list allows only 1 open item — check it off to add more."
					)
				)
				.toBeInTheDocument();

			// A non-item event never produces the toast either.
			rejectedListener!({
				entityType: 'category',
				name: null,
				listId: 1,
				message: 'Forbidden'
			});
		});

		it('lets the rejection toast be dismissed by its button', async () => {
			let rejectedListener: ((event: unknown) => void) | undefined;
			vi.mocked(onCreateRejected).mockImplementation((listener) => {
				rejectedListener = listener as (event: unknown) => void;
				return vi.fn();
			});
			mountWithLimit(null);
			render(ListDetailPage);
			await expect.element(page.getByText('1 of 2 remaining')).toBeInTheDocument();

			rejectedListener!({
				entityType: 'item',
				name: 'Milk',
				listId: 1,
				message: 'This list allows only 1 open item — check it off to add more.'
			});
			const toast = page.getByText(
				"Milk wasn't added — This list allows only 1 open item — check it off to add more."
			);
			await expect.element(toast).toBeInTheDocument();

			await page.getByRole('button', { name: 'Dismiss' }).click();
			await expect.element(toast).not.toBeInTheDocument();
		});

		it('lets the rejection toast time out on its own', async () => {
			vi.useFakeTimers();
			let rejectedListener: ((event: unknown) => void) | undefined;
			vi.mocked(onCreateRejected).mockImplementation((listener) => {
				rejectedListener = listener as (event: unknown) => void;
				return vi.fn();
			});
			mountWithLimit(null);
			render(ListDetailPage);
			await expect.element(page.getByText('1 of 2 remaining')).toBeInTheDocument();

			rejectedListener!({
				entityType: 'item',
				name: 'Milk',
				listId: 1,
				message: 'This list allows only 1 open item — check it off to add more.'
			});
			const toast = page.getByText(
				"Milk wasn't added — This list allows only 1 open item — check it off to add more."
			);
			await expect.element(toast).toBeInTheDocument();

			await vi.advanceTimersByTimeAsync(5000);

			await expect.element(toast).not.toBeInTheDocument();
		});
	});
});
