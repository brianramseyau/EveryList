import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import type { SortableReorderParams } from '$lib/actions/sortable-reorder';

// See the item-list page's spec for why this is mocked: SortableJS's own
// drag mechanics aren't something a component test can reliably drive, so
// this test double lets tests invoke the page's onDrop handler directly.
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

vi.mock('$app/state', () => ({ page: { params: { id: '1', storeId: '20' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/stores', () => ({
	fetchStores: vi.fn(),
	fetchStoreCategoryOrder: vi.fn(),
	reorderStoreCategories: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const { fetchStores, fetchStoreCategoryOrder, reorderStoreCategories } =
	await import('$lib/api/stores');
const { goto } = await import('$app/navigation');
const StoreOrderPage = (await import('./+page.svelte')).default;

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
const walmart = {
	id: 20,
	name: 'Walmart',
	color: '#3b82f6',
	createdBy: 1,
	createdAt: TS,
	updatedAt: null,
	deletedAt: null,
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

describe('Store aisle order +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchStores).mockResolvedValue([walmart]);
		vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(StoreOrderPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('sets the document title to the loading fallback before the store resolves, then to the aisle-order title', async () => {
		let resolveFetch!: (value: typeof list) => void;
		vi.mocked(fetchList).mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			})
		);

		render(StoreOrderPage);

		expect(document.title).toBe('Store — EveryList');

		resolveFetch(list);

		await expect.poll(() => document.title).toBe('Walmart aisle order — EveryList');
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(StoreOrderPage);

		await expect
			.element(page.getByText('Failed to load store category order.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(StoreOrderPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('renders categories in default order under the store name', async () => {
		render(StoreOrderPage);

		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await expect.element(page.getByText('Dairy')).toBeInTheDocument();
		await expect
			.element(page.getByText('Everyone who shops at "Walmart" sees this order.'))
			.toBeInTheDocument();
	});

	it('falls back to "Store" when the store id has no matching store', async () => {
		vi.mocked(fetchStores).mockResolvedValue([]);

		render(StoreOrderPage);

		await expect.element(page.getByText('Store — Aisle order')).toBeInTheDocument();
		await expect
			.element(page.getByText('Everyone who shops at "" sees this order.'))
			.toBeInTheDocument();
	});

	it('applies stored sort-order overrides on load', async () => {
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 },
			{ id: 2, storeId: 20, categoryId: 10, sortOrder: 1, deletedAt: null, version: 1 }
		]);

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		const names = document.querySelectorAll('li > span:last-child');
		expect([...names].map((el) => el.textContent)).toEqual(['Dairy', 'Produce']);
	});

	// Invokes the onDrop handler SortableJS would have called on a real drop
	// (see the mock above) — there's only one `<ul>` on this page.
	function triggerDrop(params: {
		itemId: number;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) {
		const ul = document.querySelector('ul') as HTMLElement & {
			__onDrop?: (p: typeof params) => void;
		};
		ul.__onDrop?.(params);
	}

	it('moves a category down and persists the new order', async () => {
		vi.mocked(reorderStoreCategories).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 },
			{ id: 2, storeId: 20, categoryId: 10, sortOrder: 1, deletedAt: null, version: 1 }
		]);

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		// Starting order is [Produce(10), Dairy(11)]; drag Produce below Dairy,
		// landing at the end.
		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		expect(reorderStoreCategories).toHaveBeenCalledWith(20, [
			{ categoryId: 11, sortOrder: 0 },
			{ categoryId: 10, sortOrder: 1 }
		]);
	});

	it('moves a category up by dragging it above its neighbor', async () => {
		vi.mocked(reorderStoreCategories).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 11, sortOrder: 0, deletedAt: null, version: 1 },
			{ id: 2, storeId: 20, categoryId: 10, sortOrder: 1, deletedAt: null, version: 1 }
		]);

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		// Drag Dairy above Produce, landing at the start.
		triggerDrop({ itemId: 11, beforeItemId: null, afterItemId: 10 });

		expect(reorderStoreCategories).toHaveBeenCalledWith(20, [
			{ categoryId: 11, sortOrder: 0 },
			{ categoryId: 10, sortOrder: 1 }
		]);
	});

	it('keeps a category in its original slot when the drop has no neighbors at all', async () => {
		vi.mocked(reorderStoreCategories).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 10, sortOrder: 0, deletedAt: null, version: 1 },
			{ id: 2, storeId: 20, categoryId: 11, sortOrder: 1, deletedAt: null, version: 1 }
		]);

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		// No before/after neighbor — insertAt falls back to the end.
		triggerDrop({ itemId: 10, beforeItemId: null, afterItemId: null });

		expect(reorderStoreCategories).toHaveBeenCalledWith(20, [
			{ categoryId: 11, sortOrder: 0 },
			{ categoryId: 10, sortOrder: 1 }
		]);
	});

	it('shows an error banner over the still-loaded list when a reload after a failure also fails', async () => {
		// handleDrop's catch reloads via loadAll(); if that reload's own fetch
		// also fails, `list` stays populated (the destructuring assignment
		// that would clear it never runs) while `error` gets set — the one
		// path where the error banner renders inside the loaded-list view
		// rather than the page collapsing to "Loading…".
		vi.mocked(reorderStoreCategories).mockRejectedValue(new TypeError('reorder failed'));
		vi.mocked(fetchList)
			.mockResolvedValueOnce(list)
			.mockRejectedValueOnce(new TypeError('reload failed'));

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		await expect
			.element(page.getByText('Failed to load store category order.'))
			.toBeInTheDocument();
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();
	});

	it('reloads the list when reordering fails without an ApiError', async () => {
		// handleDrop's catch sets `error` and immediately triggers a reload
		// via loadAll(), which flips `loading` back to true in the same tick
		// — the page collapses to its "Loading…" state before the error
		// message ever paints, so what's observable here is the reload.
		vi.mocked(reorderStoreCategories).mockRejectedValue(new TypeError('network down'));

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchList).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();
	});

	it('reloads the list when reordering fails with an ApiError', async () => {
		vi.mocked(reorderStoreCategories).mockRejectedValue(new ApiError(500, 'Could not save'));

		render(StoreOrderPage);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();

		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchList).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Walmart — Aisle order')).toBeInTheDocument();
	});
});
