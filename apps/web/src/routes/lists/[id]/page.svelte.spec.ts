import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ItemDto, SyncEventDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('$lib/api/items', () => ({
	fetchItems: vi.fn(),
	fetchRecentItems: vi.fn(),
	createItem: vi.fn(),
	deleteItem: vi.fn(),
	importItems: vi.fn(),
	restoreItem: vi.fn(),
	updateItem: vi.fn()
}));
vi.mock('$lib/api/stores', () => ({ fetchStoreCategoryOrder: vi.fn() }));
vi.mock('$lib/api/selected-store', () => ({
	getSelectedStore: vi.fn(),
	setSelectedStore: vi.fn()
}));
vi.mock('$lib/realtime', () => ({ subscribeToList: vi.fn(() => vi.fn()) }));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories } = await import('$lib/api/categories');
const {
	fetchItems,
	fetchRecentItems,
	createItem,
	deleteItem,
	updateItem,
	importItems,
	restoreItem
} = await import('$lib/api/items');
const { fetchStoreCategoryOrder } = await import('$lib/api/stores');
const { getSelectedStore } = await import('$lib/api/selected-store');
const { subscribeToList } = await import('$lib/realtime');
const { goto } = await import('$app/navigation');
const ListDetailPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const list = {
	id: 1,
	name: 'Groceries',
	color: '#3b82f6',
	icon: null,
	ownerId: 1,
	archived: false,
	itemCount: 0,
	createdAt: TS,
	updatedAt: null
};
const produce = {
	id: 10,
	listId: null,
	name: 'Produce',
	icon: 'apple',
	sortOrder: 0,
	isDefault: true,
	createdAt: TS,
	updatedAt: null
};
const dairy = {
	id: 11,
	listId: null,
	name: 'Dairy',
	icon: 'milk',
	sortOrder: 1,
	isDefault: true,
	createdAt: TS,
	updatedAt: null
};

function makeItem(overrides: Partial<ItemDto> & Pick<ItemDto, 'id' | 'name'>): ItemDto {
	return {
		listId: 1,
		quantity: null,
		notes: null,
		categoryId: null,
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: TS,
		updatedAt: null,
		deletedAt: null,
		...overrides
	};
}

describe('List detail +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce, dairy]);
		vi.mocked(fetchItems).mockResolvedValue([]);
		vi.mocked(fetchRecentItems).mockResolvedValue([]);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([]);
		vi.mocked(getSelectedStore).mockReturnValue(null);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
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
		vi.mocked(getSelectedStore).mockReturnValue(7);
		vi.mocked(fetchStoreCategoryOrder).mockResolvedValue([
			{ id: 1, storeId: 7, categoryId: 10, sortOrder: 5 },
			{ id: 2, storeId: 7, categoryId: 11, sortOrder: 0 }
		]);
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Milk', categoryId: 11 })
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

	it('groups items by category and lists checked items separately', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', quantity: '2', categoryId: 10 }),
			makeItem({
				id: 101,
				name: 'Milk',
				categoryId: 11,
				checked: true,
				checkedAt: '2026-08-13T00:00:00.000Z',
				sortOrder: 1
			})
		]);

		render(ListDetailPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Produce')).toBeInTheDocument();
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Checked')).toBeInTheDocument();
		await expect.element(page.getByText('Milk')).toBeInTheDocument();

		const produceHeader = page.getByText('Produce').element().closest('h2');
		expect(produceHeader).not.toBeNull();
		expect(produceHeader?.style.color).toBe('rgb(59, 130, 246)');
	});

	it('adds a new item with a quantity via the form', async () => {
		vi.mocked(createItem).mockResolvedValue(makeItem({ id: 200, name: 'Bread', quantity: '2' }));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByPlaceholder('Qty').fill('2');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		expect(createItem).toHaveBeenCalledWith(1, { name: 'Bread', quantity: '2' });
	});

	it('does not submit when the new item name is only whitespace', async () => {
		// The Add button is already disabled in this state, but handleAddItem
		// carries its own guard, reachable via a raw 'submit' event and not
		// just a click on the (disabled) button.
		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

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
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Failed to add item.')).toBeInTheDocument();
	});

	it('shows the ApiError message when adding an item fails', async () => {
		vi.mocked(createItem).mockRejectedValue(new ApiError(422, 'Duplicate item'));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByPlaceholder('Item name').fill('Bread');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Duplicate item')).toBeInTheDocument();
	});

	it('opens and closes the paste-import form', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await expect
			.element(page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs'))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel paste import' }).click();
		await expect
			.element(page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs'))
			.not.toBeInTheDocument();
	});

	it('imports items pasted into the textarea', async () => {
		vi.mocked(importItems).mockResolvedValue([
			makeItem({ id: 400, name: 'Milk' }),
			makeItem({ id: 401, name: 'Bread' })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs').fill('Milk\nBread');
		await page.getByRole('button', { name: 'Import items' }).click();

		expect(importItems).toHaveBeenCalledWith(1, 'Milk\nBread');
		await expect.element(page.getByText('Bread')).toBeInTheDocument();
		await expect
			.element(page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs'))
			.not.toBeInTheDocument();
	});

	it('does not import when the pasted text is only whitespace', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		const textarea = page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs');
		await textarea.fill('   ');
		textarea
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(importItems).mock.calls.length).toBe(0);
	});

	it('shows a generic error message when importing fails without an ApiError', async () => {
		vi.mocked(importItems).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs').fill('Milk');
		await page.getByRole('button', { name: 'Import items' }).click();

		await expect.element(page.getByText('Failed to import items.')).toBeInTheDocument();
	});

	it('shows the ApiError message when importing fails', async () => {
		vi.mocked(importItems).mockRejectedValue(new ApiError(422, 'Could not parse items'));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Paste in a list…' }).click();
		await page.getByPlaceholder('One item per line, e.g. Milk, Bread, Eggs').fill('Milk');
		await page.getByRole('button', { name: 'Import items' }).click();

		await expect.element(page.getByText('Could not parse items')).toBeInTheDocument();
	});

	it('toggles one item checked without affecting a sibling item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 }),
			makeItem({ id: 101, name: 'Bread', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Bread')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: true });
		await expect.element(page.getByText('Checked')).toBeInTheDocument();
		// Bread stays unchecked (and thus still in the main list) — proves the
		// map only updates the toggled item, not every item.
		await expect.element(page.getByRole('checkbox', { name: 'Bread' })).not.toBeChecked();
	});

	it('unchecks a checked item from the "Checked" section', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Checked')).toBeInTheDocument();

		await page.getByRole('checkbox', { name: 'Bananas' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 100, { checked: false });
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
		await expect.element(page.getByText('Checked')).not.toBeInTheDocument();
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

	it('removes a checked item from the "Checked" section', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10, checked: true })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Checked')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();
	});

	it('removes an item', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		expect(deleteItem).toHaveBeenCalledWith(1, 100);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();
	});

	it('prepends a removed item to the recently-deleted list when it is open', async () => {
		vi.mocked(fetchItems).mockResolvedValue([
			makeItem({ id: 100, name: 'Bananas', categoryId: 10 })
		]);

		render(ListDetailPage);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Nothing recently deleted.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.element(page.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
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

		await page.getByRole('button', { name: 'Remove' }).click();

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

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect.poll(() => vi.mocked(fetchItems).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Bananas')).toBeInTheDocument();
	});

	it('shows a generic error message when loading recently deleted items fails without an ApiError', async () => {
		vi.mocked(fetchRecentItems).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();

		await expect
			.element(page.getByText('Failed to load recently deleted items.'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when loading recently deleted items fails', async () => {
		vi.mocked(fetchRecentItems).mockRejectedValue(new ApiError(500, 'Could not load recent'));

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();

		await expect.element(page.getByText('Could not load recent')).toBeInTheDocument();
	});

	it('hides the recently-deleted panel again on a second click', async () => {
		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Nothing recently deleted.')).toBeInTheDocument();
		expect(fetchRecentItems).toHaveBeenCalledTimes(1);

		await page.getByRole('button', { name: 'Hide recently deleted' }).click();
		await expect.element(page.getByText('Nothing recently deleted.')).not.toBeInTheDocument();
		// Closing again shouldn't re-trigger a load.
		expect(fetchRecentItems).toHaveBeenCalledTimes(1);
	});

	it('shows a generic error message when restoring an item fails without an ApiError', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([
			makeItem({ id: 300, name: 'Eggs', deletedAt: '2026-08-12T00:00:00.000Z' })
		]);
		vi.mocked(restoreItem).mockRejectedValue(new TypeError('network down'));

		render(ListDetailPage);

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		await expect.element(page.getByText('Failed to restore item.')).toBeInTheDocument();
		await expect.poll(() => vi.mocked(fetchRecentItems).mock.calls.length).toBe(2);
	});

	it('shows the ApiError message when restoring an item fails', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([
			makeItem({ id: 300, name: 'Eggs', deletedAt: '2026-08-12T00:00:00.000Z' })
		]);
		vi.mocked(restoreItem).mockRejectedValue(new ApiError(500, 'Could not restore'));

		render(ListDetailPage);

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();

		await expect.element(page.getByText('Could not restore')).toBeInTheDocument();
	});

	it('shows recently deleted items and restores one', async () => {
		vi.mocked(fetchRecentItems).mockResolvedValue([
			makeItem({ id: 300, name: 'Eggs', deletedAt: '2026-08-12T00:00:00.000Z' })
		]);
		vi.mocked(restoreItem).mockResolvedValue(makeItem({ id: 300, name: 'Eggs', sortOrder: 2 }));

		render(ListDetailPage);

		await page.getByRole('button', { name: 'Show recently deleted' }).click();
		await expect.element(page.getByText('Eggs')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Restore' }).click();
		expect(restoreItem).toHaveBeenCalledWith(1, 300);
	});

	it('subscribes to the list channel and shows a toast on a sync event, refreshing on click', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		const unsubscribe = vi.fn();
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return unsubscribe;
		});

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();
		expect(subscribeToList).toHaveBeenCalledWith(1, expect.any(Function));

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null });
		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
		expect(fetchList).toHaveBeenCalledTimes(2);
	});

	it('dismisses the sync toast without refreshing', async () => {
		let handler: (event: SyncEventDto) => void = () => {};
		vi.mocked(subscribeToList).mockImplementation((_listId, onEvent) => {
			handler = onEvent;
			return vi.fn();
		});

		render(ListDetailPage);
		await expect.element(page.getByText('No items yet — add one above.')).toBeInTheDocument();

		handler({ entityType: 'item', entityId: 1, op: 'create', payload: null });
		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
		expect(fetchList).toHaveBeenCalledTimes(1);
	});
});
