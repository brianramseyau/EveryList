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

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({
	fetchCategories: vi.fn(),
	updateCategory: vi.fn(),
	deleteCategory: vi.fn(),
	reorderCategories: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories, updateCategory, deleteCategory, reorderCategories } =
	await import('$lib/api/categories');
const { goto } = await import('$app/navigation');
const CategoriesPage = (await import('./+page.svelte')).default;

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
const custom = {
	id: 11,
	listId: 1,
	name: 'Pet Supplies',
	icon: 'paw',
	sortOrder: 1,
	isDefault: false,
	createdAt: TS,
	updatedAt: null,
	deletedAt: null,
	version: 1
};

describe('Categories +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchList).mockResolvedValue(list);
		vi.mocked(fetchCategories).mockResolvedValue([produce, custom]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(CategoriesPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('sets the document title to the loading fallback before the list resolves, then to the list categories title', async () => {
		let resolveFetch!: (value: typeof list) => void;
		vi.mocked(fetchList).mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			})
		);

		render(CategoriesPage);

		expect(document.title).toBe('Categories — EveryList');

		resolveFetch(list);

		await expect.poll(() => document.title).toBe('Groceries categories — EveryList');
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchList).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);

		await expect.element(page.getByText('Failed to load categories.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchList).mockRejectedValue(new ApiError(500, 'List not found'));

		render(CategoriesPage);

		await expect.element(page.getByText('List not found')).toBeInTheDocument();
	});

	it('links back to List Settings, not the list view', async () => {
		render(CategoriesPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		const backLink = page.getByRole('link', { name: 'Back to settings' });
		await expect.element(backLink).toBeInTheDocument();
		expect(backLink.element().getAttribute('href')).toBe('/lists/1/settings');
	});

	it('opens the "+" popout to reveal Create / Import / Paste links', async () => {
		render(CategoriesPage);

		await page.getByRole('button', { name: 'Create' }).click();

		const createLink = page.getByRole('link', { name: 'Create' });
		await expect.element(createLink).toBeInTheDocument();
		expect(createLink.element().getAttribute('href')).toBe('/lists/1/categories/new');

		const importLink = page.getByRole('link', { name: 'Import' });
		await expect.element(importLink).toBeInTheDocument();
		expect(importLink.element().getAttribute('href')).toBe('/lists/1/categories/import');

		const pasteLink = page.getByRole('link', { name: 'Paste' });
		await expect.element(pasteLink).toBeInTheDocument();
		expect(pasteLink.element().getAttribute('href')).toBe('/lists/1/categories/paste');
	});

	it('only shows Delete for list-scoped categories, not global defaults', async () => {
		render(CategoriesPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		const deleteButtons = page.getByRole('button', { name: 'Delete' });
		await expect.element(deleteButtons).toBeInTheDocument();
		await expect.poll(async () => (await deleteButtons.all()).length).toBe(1);
	});

	it('auto-saves an edited category name when the field loses focus', async () => {
		vi.mocked(updateCategory).mockResolvedValue({ ...produce, name: 'Fruits & Veg' });

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		// Textbox order: one per category row — Produce is the first row.
		const nameInput = page.getByRole('textbox').nth(0);
		await nameInput.fill('Fruits & Veg');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(updateCategory).mock.calls.length).toBe(1);
		expect(updateCategory).toHaveBeenCalledWith(1, 10, { name: 'Fruits & Veg', icon: 'apple' });
	});

	it('does not save on blur when the name was not changed', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const nameInput = page.getByRole('textbox').nth(0);
		nameInput.element().focus();
		nameInput.element().blur();

		expect(updateCategory).not.toHaveBeenCalled();
	});

	it('keeps the locally edited fields when the save is queued offline (no server response yet)', async () => {
		vi.mocked(updateCategory).mockResolvedValue(undefined);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const nameInput = page.getByRole('textbox').nth(0);
		await nameInput.fill('Fruits & Veg');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(updateCategory).mock.calls.length).toBe(1);
		expect(updateCategory).toHaveBeenCalledWith(1, 10, { name: 'Fruits & Veg', icon: 'apple' });
		await expect.element(page.getByRole('textbox').nth(0)).toHaveValue('Fruits & Veg');
	});

	it('picks a new icon for an existing category, saving it immediately', async () => {
		vi.mocked(updateCategory).mockResolvedValue({ ...produce, icon: 'carrot' });

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Apple' }).click();
		await page.getByPlaceholder('Search icons…').fill('carrot');
		await page.getByRole('button', { name: 'Carrot', exact: true }).click();

		await expect.poll(() => vi.mocked(updateCategory).mock.calls.length).toBe(1);
		expect(updateCategory).toHaveBeenCalledWith(1, 10, { name: 'Produce', icon: 'carrot' });
	});

	it('reloads the list when saving a category fails without an ApiError', async () => {
		// saveCategory's catch sets `error` and immediately triggers a reload
		// via loadAll(), which flips `loading` back to true in the same tick —
		// the page collapses to its "Loading…" state before the error message
		// ever paints, so what's observable here is the reload itself.
		vi.mocked(updateCategory).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Apple' }).click();
		await page.getByPlaceholder('Search icons…').fill('carrot');
		await page.getByRole('button', { name: 'Carrot', exact: true }).click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
	});

	it('reloads the list when saving a category fails with an ApiError', async () => {
		vi.mocked(updateCategory).mockRejectedValue(new ApiError(500, 'Could not save'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Apple' }).click();
		await page.getByPlaceholder('Search icons…').fill('carrot');
		await page.getByRole('button', { name: 'Carrot', exact: true }).click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
	});

	it('deletes a list-scoped category', async () => {
		vi.mocked(deleteCategory).mockResolvedValue(undefined);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		expect(deleteCategory).toHaveBeenCalledWith(1, 11);
	});

	it('reloads the list when deleting a category fails without an ApiError', async () => {
		vi.mocked(deleteCategory).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
	});

	it('reloads the list when deleting a category fails with an ApiError', async () => {
		vi.mocked(deleteCategory).mockRejectedValue(new ApiError(500, 'Could not delete'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
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

	it('reorders categories by dragging the first one below the second', async () => {
		vi.mocked(reorderCategories).mockResolvedValue([custom, produce]);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		// Starting order is [Produce(10), Pet Supplies(11)]; drag Produce below
		// Pet Supplies, landing at the end.
		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		await expect.poll(() => vi.mocked(reorderCategories).mock.calls.length).toBe(1);
		expect(reorderCategories).toHaveBeenCalledWith(1, [11, 10]);
	});

	it('reorders categories by dragging the second one above the first', async () => {
		vi.mocked(reorderCategories).mockResolvedValue([custom, produce]);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		// Drag Pet Supplies above Produce, landing at the start.
		triggerDrop({ itemId: 11, beforeItemId: null, afterItemId: 10 });

		await expect.poll(() => vi.mocked(reorderCategories).mock.calls.length).toBe(1);
		expect(reorderCategories).toHaveBeenCalledWith(1, [11, 10]);
	});

	it('keeps a category in its original slot when the drop has no neighbors at all', async () => {
		vi.mocked(reorderCategories).mockResolvedValue([produce, custom]);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		// No before/after neighbor — insertAt falls back to the end.
		triggerDrop({ itemId: 10, beforeItemId: null, afterItemId: null });

		await expect.poll(() => vi.mocked(reorderCategories).mock.calls.length).toBe(1);
		expect(reorderCategories).toHaveBeenCalledWith(1, [11, 10]);
	});

	it('reloads the list when reordering fails without an ApiError', async () => {
		vi.mocked(reorderCategories).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
	});

	it('reloads the list when reordering fails with an ApiError', async () => {
		vi.mocked(reorderCategories).mockRejectedValue(new ApiError(500, 'Could not reorder'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		triggerDrop({ itemId: 10, beforeItemId: 11, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
	});
});
