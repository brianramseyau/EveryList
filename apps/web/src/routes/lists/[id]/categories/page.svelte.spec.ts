import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryDto } from '@everylist/shared';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import { HOLD_MS } from '$lib/actions/press-hold-reorder';

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

vi.mock('$app/state', () => ({ page: { params: { id: '1' } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/lists', () => ({ fetchList: vi.fn() }));
vi.mock('$lib/api/categories', () => ({
	fetchCategories: vi.fn(),
	createCategory: vi.fn(),
	updateCategory: vi.fn(),
	deleteCategory: vi.fn(),
	reorderCategories: vi.fn()
}));

const { fetchList } = await import('$lib/api/lists');
const { fetchCategories, createCategory, updateCategory, deleteCategory, reorderCategories } =
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

	it('only shows Delete for list-scoped categories, not global defaults', async () => {
		render(CategoriesPage);

		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();
		const deleteButtons = page.getByRole('button', { name: 'Delete' });
		await expect.element(deleteButtons).toBeInTheDocument();
		await expect.poll(async () => (await deleteButtons.all()).length).toBe(1);
	});

	it('creates a new category from the form', async () => {
		vi.mocked(createCategory).mockResolvedValue({
			id: 12,
			listId: 1,
			name: 'Snacks',
			icon: 'cookie',
			sortOrder: 2,
			isDefault: false,
			createdAt: TS,
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByPlaceholder('New category name').fill('Snacks');
		await page.getByRole('button', { name: 'Tag' }).click();
		await page.getByPlaceholder('Search icons…').fill('cookie');
		await page.getByRole('button', { name: 'Cookie', exact: true }).click();
		await page.getByRole('button', { name: 'Add' }).click();

		expect(createCategory).toHaveBeenCalledWith(1, { name: 'Snacks', icon: 'cookie' });
		await expect
			.poll(async () => (await page.getByRole('button', { name: 'Save' }).all()).length)
			.toBe(3);
	});

	it('does not submit when the new category name is only whitespace', async () => {
		// The Add button is already disabled in this state, but handleCreate
		// carries its own guard, reachable via a raw 'submit' event and not
		// just a click on the (disabled) button.
		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		const input = page.getByPlaceholder('New category name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createCategory).mock.calls.length).toBe(0);
	});

	it('shows a generic error message when creating a category fails without an ApiError', async () => {
		vi.mocked(createCategory).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByPlaceholder('New category name').fill('Snacks');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Failed to create category.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a category fails', async () => {
		vi.mocked(createCategory).mockRejectedValue(new ApiError(422, 'Duplicate category'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByPlaceholder('New category name').fill('Snacks');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect.element(page.getByText('Duplicate category')).toBeInTheDocument();
	});

	it('saves an edited category name', async () => {
		vi.mocked(updateCategory).mockResolvedValue({ ...produce, name: 'Fruits & Veg' });

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		// Textbox order: the "New category name" input, then one per category
		// row — Produce is the first row.
		await page.getByRole('textbox').nth(1).fill('Fruits & Veg');
		await page.getByRole('button', { name: 'Save', exact: true }).first().click();

		expect(updateCategory).toHaveBeenCalledWith(1, 10, { name: 'Fruits & Veg', icon: 'apple' });
	});

	it('keeps the locally edited fields when the save is queued offline (no server response yet)', async () => {
		vi.mocked(updateCategory).mockResolvedValue(undefined);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('textbox').nth(1).fill('Fruits & Veg');
		await page.getByRole('button', { name: 'Save', exact: true }).first().click();

		expect(updateCategory).toHaveBeenCalledWith(1, 10, { name: 'Fruits & Veg', icon: 'apple' });
		await expect.element(page.getByRole('textbox').nth(1)).toHaveValue('Fruits & Veg');
	});

	it('picks a new icon for an existing category', async () => {
		vi.mocked(updateCategory).mockResolvedValue({ ...produce, icon: 'carrot' });

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Apple' }).click();
		await page.getByPlaceholder('Search icons…').fill('carrot');
		await page.getByRole('button', { name: 'Carrot', exact: true }).click();
		await page.getByRole('button', { name: 'Save', exact: true }).first().click();

		expect(updateCategory).toHaveBeenCalledWith(1, 10, { name: 'Produce', icon: 'carrot' });
	});

	it('reloads the list when saving a category fails without an ApiError', async () => {
		// saveCategory's catch sets `error` and immediately triggers a reload
		// via loadAll(), which flips `loading` back to true in the same tick —
		// the page collapses to its "Loading…" state before the error message
		// ever paints, so what's observable here is the reload itself.
		vi.mocked(updateCategory).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Save', exact: true }).first().click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();
	});

	it('reloads the list when saving a category fails with an ApiError', async () => {
		vi.mocked(updateCategory).mockRejectedValue(new ApiError(500, 'Could not save'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Save', exact: true }).first().click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();
	});

	it('deletes a list-scoped category', async () => {
		vi.mocked(deleteCategory).mockResolvedValue(undefined);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		expect(deleteCategory).toHaveBeenCalledWith(1, 11);
	});

	it('reloads the list when deleting a category fails without an ApiError', async () => {
		vi.mocked(deleteCategory).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();
	});

	it('reloads the list when deleting a category fails with an ApiError', async () => {
		vi.mocked(deleteCategory).mockRejectedValue(new ApiError(500, 'Could not delete'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete' }).click();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();
	});

	function rows() {
		return page.getByRole('listitem');
	}

	async function dragFirstBelowSecond() {
		const items = rows();
		const first = items.first().element();
		const second = items.nth(1).element();
		const secondRect = second.getBoundingClientRect();

		first.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		first.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);
		first.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);
	}

	it('reorders categories by dragging the first one below the second', async () => {
		vi.mocked(reorderCategories).mockResolvedValue([custom, produce]);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await dragFirstBelowSecond();

		await expect.poll(() => vi.mocked(reorderCategories).mock.calls.length).toBe(1);
		expect(reorderCategories).toHaveBeenCalledWith(1, [11, 10]);
	});

	it('reorders categories by dragging the second one above the first', async () => {
		vi.mocked(reorderCategories).mockResolvedValue([custom, produce]);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		const items = rows();
		const first = items.first().element();
		const second = items.nth(1).element();
		const firstRect = first.getBoundingClientRect();

		second.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		second.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: firstRect.top
			})
		);
		second.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: firstRect.top
			})
		);

		await expect.poll(() => vi.mocked(reorderCategories).mock.calls.length).toBe(1);
		expect(reorderCategories).toHaveBeenCalledWith(1, [11, 10]);
	});

	it('does not reorder while a drag never crosses into a new position', async () => {
		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		const first = rows().first().element();
		first.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		// Pointer stays over the same (first) slot — onhover still fires, but
		// with toIndex === fromIndex.
		first.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		first.dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);

		expect(reorderCategories).not.toHaveBeenCalled();
	});

	it('ignores a new drag attempt while a reorder is already in flight', async () => {
		let resolveReorder!: (value: CategoryDto[]) => void;
		vi.mocked(reorderCategories).mockReturnValue(
			new Promise((resolve) => {
				resolveReorder = resolve;
			})
		);

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await dragFirstBelowSecond();
		expect(reorderCategories).toHaveBeenCalledTimes(1);

		// A second drag attempt while the first reorder is still in flight
		// (`disabled: reordering` on the row) must not fire another one.
		await dragFirstBelowSecond();
		expect(reorderCategories).toHaveBeenCalledTimes(1);

		resolveReorder([custom, produce]);
	});

	it('reloads the list when reordering fails without an ApiError', async () => {
		vi.mocked(reorderCategories).mockRejectedValue(new TypeError('network down'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await dragFirstBelowSecond();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
	});

	it('reloads the list when reordering fails with an ApiError', async () => {
		vi.mocked(reorderCategories).mockRejectedValue(new ApiError(500, 'Could not reorder'));

		render(CategoriesPage);
		await expect.element(page.getByText('Groceries — Categories')).toBeInTheDocument();

		await dragFirstBelowSecond();

		await expect.poll(() => vi.mocked(fetchCategories).mock.calls.length).toBe(2);
	});
});
