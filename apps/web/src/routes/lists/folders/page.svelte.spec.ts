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

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/folders', () => ({
	fetchFolders: vi.fn(),
	updateFolder: vi.fn(),
	deleteFolder: vi.fn(),
	reorderFolders: vi.fn()
}));

const { fetchFolders, updateFolder, deleteFolder, reorderFolders } =
	await import('$lib/api/folders');
const { goto } = await import('$app/navigation');
const FoldersPage = (await import('./+page.svelte')).default;

const TS = '2026-08-01T00:00:00.000Z';

const groceries = {
	id: 5,
	userId: 1,
	name: 'Groceries',
	color: '#3b82f6',
	sortOrder: 0,
	createdAt: TS,
	updatedAt: null,
	version: 1
};
const household = {
	id: 6,
	userId: 1,
	name: 'Household',
	color: '#22c55e',
	sortOrder: 1,
	createdAt: TS,
	updatedAt: null,
	version: 1
};

// Textbox order on this page: one per folder row — Groceries is the first
// row, so index 0.
async function waitForLoad() {
	await expect.element(page.getByRole('textbox').nth(0)).toHaveValue('Groceries');
}

describe('Manage Folders +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchFolders).mockResolvedValue([groceries, household]);
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(FoldersPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchFolders).mockRejectedValue(new TypeError('network down'));

		render(FoldersPage);

		await expect.element(page.getByText('Failed to load folders.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchFolders).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(FoldersPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows an empty state when there are no folders', async () => {
		vi.mocked(fetchFolders).mockResolvedValue([]);

		render(FoldersPage);

		await expect.element(page.getByText('No folders yet — tap + to add one.')).toBeInTheDocument();
	});

	it('links the + button to the New Folder page', async () => {
		render(FoldersPage);

		const newFolderLink = page.getByRole('link', { name: 'New folder' });
		await expect.element(newFolderLink).toBeInTheDocument();
		expect(newFolderLink.element().getAttribute('href')).toBe('/lists/folders/new');
	});

	it('auto-saves an edited folder name when the field loses focus', async () => {
		vi.mocked(updateFolder).mockResolvedValue({ ...groceries, name: 'Grocery Runs' });

		render(FoldersPage);
		await waitForLoad();

		const nameInput = page.getByRole('textbox').nth(0);
		await nameInput.fill('Grocery Runs');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(updateFolder).mock.calls.length).toBe(1);
		expect(updateFolder).toHaveBeenCalledWith(5, { name: 'Grocery Runs' });
	});

	it('does not save on blur when the name was not changed', async () => {
		render(FoldersPage);
		await waitForLoad();

		const nameInput = page.getByRole('textbox').nth(0);
		nameInput.element().focus();
		nameInput.element().blur();

		expect(updateFolder).not.toHaveBeenCalled();
	});

	it('reloads when saving a folder name fails with an ApiError', async () => {
		vi.mocked(updateFolder).mockRejectedValue(new ApiError(500, 'Could not save'));

		render(FoldersPage);
		await waitForLoad();

		const nameInput = page.getByRole('textbox').nth(0);
		await nameInput.fill('Grocery Runs');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(fetchFolders).mock.calls.length).toBe(2);
	});

	it('reloads when saving a folder name fails without an ApiError', async () => {
		vi.mocked(updateFolder).mockRejectedValue(new TypeError('network down'));

		render(FoldersPage);
		await waitForLoad();

		const nameInput = page.getByRole('textbox').nth(0);
		await nameInput.fill('Grocery Runs');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(fetchFolders).mock.calls.length).toBe(2);
	});

	it('picks a new color for an existing folder, saving it immediately', async () => {
		vi.mocked(updateFolder).mockResolvedValue({ ...groceries, color: '#ef4444' });

		render(FoldersPage);
		await waitForLoad();

		// Color buttons: one per row — Groceries' is the first row picker.
		await page.getByRole('button', { name: 'Color' }).nth(0).click();
		await page.getByRole('button', { name: '#ef4444' }).click();

		await expect.poll(() => vi.mocked(updateFolder).mock.calls.length).toBe(1);
		expect(updateFolder).toHaveBeenCalledWith(5, { color: '#ef4444' });
	});

	it('deletes a folder', async () => {
		vi.mocked(deleteFolder).mockResolvedValue(undefined);

		render(FoldersPage);
		await waitForLoad();

		await page.getByRole('button', { name: 'Delete' }).first().click();

		expect(deleteFolder).toHaveBeenCalledWith(5);
		// Only Household's row remains, so it sits at index 0.
		await expect.element(page.getByRole('textbox').nth(0)).toHaveValue('Household');
		await expect.poll(async () => (await page.getByRole('textbox').all()).length).toBe(1);
	});

	it('reloads when deleting a folder fails without an ApiError', async () => {
		vi.mocked(deleteFolder).mockRejectedValue(new TypeError('network down'));

		render(FoldersPage);
		await waitForLoad();

		await page.getByRole('button', { name: 'Delete' }).first().click();

		await expect.poll(() => vi.mocked(fetchFolders).mock.calls.length).toBe(2);
	});

	it('reloads when deleting a folder fails with an ApiError', async () => {
		vi.mocked(deleteFolder).mockRejectedValue(new ApiError(500, 'Could not delete'));

		render(FoldersPage);
		await waitForLoad();

		await page.getByRole('button', { name: 'Delete' }).first().click();

		await expect.poll(() => vi.mocked(fetchFolders).mock.calls.length).toBe(2);
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

	it('reorders folders by dragging the first one below the second', async () => {
		vi.mocked(reorderFolders).mockResolvedValue([household, groceries]);

		render(FoldersPage);
		await waitForLoad();

		triggerDrop({ itemId: 5, beforeItemId: 6, afterItemId: null });

		await expect.poll(() => vi.mocked(reorderFolders).mock.calls.length).toBe(1);
		expect(reorderFolders).toHaveBeenCalledWith([6, 5]);
	});

	it('reorders folders by dragging the second one above the first', async () => {
		vi.mocked(reorderFolders).mockResolvedValue([household, groceries]);

		render(FoldersPage);
		await waitForLoad();

		triggerDrop({ itemId: 6, beforeItemId: null, afterItemId: 5 });

		await expect.poll(() => vi.mocked(reorderFolders).mock.calls.length).toBe(1);
		expect(reorderFolders).toHaveBeenCalledWith([6, 5]);
	});

	it('keeps a folder in its original slot when the drop has no neighbors at all', async () => {
		vi.mocked(reorderFolders).mockResolvedValue([groceries, household]);

		render(FoldersPage);
		await waitForLoad();

		triggerDrop({ itemId: 5, beforeItemId: null, afterItemId: null });

		await expect.poll(() => vi.mocked(reorderFolders).mock.calls.length).toBe(1);
		expect(reorderFolders).toHaveBeenCalledWith([6, 5]);
	});

	it('reloads when reordering fails without an ApiError', async () => {
		vi.mocked(reorderFolders).mockRejectedValue(new TypeError('network down'));

		render(FoldersPage);
		await waitForLoad();

		triggerDrop({ itemId: 5, beforeItemId: 6, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchFolders).mock.calls.length).toBe(2);
	});

	it('reloads when reordering fails with an ApiError', async () => {
		vi.mocked(reorderFolders).mockRejectedValue(new ApiError(500, 'Could not reorder'));

		render(FoldersPage);
		await waitForLoad();

		triggerDrop({ itemId: 5, beforeItemId: 6, afterItemId: null });

		await expect.poll(() => vi.mocked(fetchFolders).mock.calls.length).toBe(2);
	});
});
