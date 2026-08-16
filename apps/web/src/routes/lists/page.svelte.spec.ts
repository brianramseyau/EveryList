import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { HOLD_MS } from '$lib/actions/press-hold-reorder';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const { goto } = await import('$app/navigation');
const ListsPage = (await import('./+page.svelte')).default;

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
	return { ok: true, status: 200, ...init, json: () => Promise.resolve({ data }) };
}

/** Routes a stubbed `fetch` by URL, since the page now loads lists and
 * folders in parallel — sequential `mockResolvedValueOnce` chains can't
 * express "respond differently per endpoint" the way this can. `lists` and
 * `folders` default to empty collections when not given. */
function stubFetchByUrl(routes: {
	lists?: unknown[];
	folders?: unknown[];
	deleteFolderError?: { status: number; message?: string } | Error;
	updateList?: unknown;
	updateListError?: { status: number; message?: string } | Error;
	reorderLists?: unknown[];
	reorderListsError?: { status: number; message?: string } | Error;
}) {
	function errorResponse(err: { status: number; message?: string }) {
		return Promise.resolve({
			ok: false,
			status: err.status,
			json: () => Promise.resolve({ message: err.message })
		});
	}

	const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (url.includes('/folders/')) {
			// DELETE /folders/:id
			if (routes.deleteFolderError instanceof Error)
				return Promise.reject(routes.deleteFolderError);
			if (routes.deleteFolderError) return errorResponse(routes.deleteFolderError);
			return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(undefined) });
		}
		if (url.includes('/folders')) return Promise.resolve(jsonResponse(routes.folders ?? []));
		if (url.includes('/lists/reorder')) {
			if (routes.reorderListsError instanceof Error)
				return Promise.reject(routes.reorderListsError);
			if (routes.reorderListsError) return errorResponse(routes.reorderListsError);
			return Promise.resolve(jsonResponse(routes.reorderLists ?? routes.lists ?? []));
		}
		if (url.includes('/lists/') && init?.method === 'PATCH') {
			if (routes.updateListError instanceof Error) return Promise.reject(routes.updateListError);
			if (routes.updateListError) return errorResponse(routes.updateListError);
			return Promise.resolve(jsonResponse(routes.updateList));
		}
		return Promise.resolve(jsonResponse(routes.lists ?? []));
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('Lists +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		render(ListsPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('renders the lists fetched on mount', async () => {
		setToken('test-token');
		stubFetchByUrl({
			lists: [
				{
					id: 1,
					name: 'Groceries',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 3
				},
				{
					id: 2,
					name: 'Hardware',
					archived: true,
					color: '#ef4444',
					icon: null,
					folderId: null,
					itemCount: 0
				}
			]
		});

		render(ListsPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Hardware')).toBeInTheDocument();
		await expect.element(page.getByText('Archived')).toBeInTheDocument();
		await expect.element(page.getByText('3 items')).toBeInTheDocument();
		await expect.element(page.getByText('0 items')).toBeInTheDocument();
	});

	it('shows a lock badge only on passcode-protected lists', async () => {
		setToken('test-token');
		stubFetchByUrl({
			lists: [
				{
					id: 1,
					name: 'Groceries',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					passcodeHash: 'salt:hash',
					itemCount: 0
				},
				{
					id: 2,
					name: 'Hardware',
					archived: false,
					color: '#ef4444',
					icon: null,
					folderId: null,
					passcodeHash: null,
					itemCount: 0
				}
			]
		});

		render(ListsPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Passcode protected')).toBeInTheDocument();
		expect(document.querySelectorAll('.sr-only')).toHaveLength(1);
	});

	it('shows sharing indicators: view-only, editor-shared, and owner-shared', async () => {
		setToken('test-token');
		stubFetchByUrl({
			lists: [
				{
					id: 1,
					name: 'Viewer List',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 0,
					role: 'viewer',
					ownerName: null,
					memberCount: 2
				},
				{
					id: 2,
					name: 'Editor List',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 0,
					role: 'editor',
					ownerName: 'Sam Owner',
					memberCount: 2
				},
				{
					id: 3,
					name: 'My Shared List',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 0,
					role: 'owner',
					ownerName: null,
					memberCount: 2
				},
				{
					id: 4,
					name: 'My Solo List',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 0,
					role: 'owner',
					ownerName: null,
					memberCount: 1
				},
				{
					id: 5,
					name: 'My Big Shared List',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 0,
					role: 'owner',
					ownerName: null,
					memberCount: 3
				}
			]
		});

		render(ListsPage);

		await expect.element(page.getByText('View only')).toBeInTheDocument();
		await expect.element(page.getByText('Shared', { exact: true }).first()).toBeInTheDocument();
		await expect.element(page.getByText('My Solo List')).toBeInTheDocument();
		expect(document.querySelectorAll('.sr-only')).toHaveLength(2);
	});

	it('shows an empty state when there are no lists', async () => {
		setToken('test-token');
		stubFetchByUrl({});

		render(ListsPage);

		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		setToken('test-token');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		render(ListsPage);

		await expect.element(page.getByText('Failed to load lists.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		setToken('test-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.resolve({ message: 'Server exploded' })
			})
		);

		render(ListsPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows the singular "item" label for a list with exactly one item', async () => {
		setToken('test-token');
		stubFetchByUrl({
			lists: [
				{
					id: 1,
					name: 'Groceries',
					archived: false,
					color: '#3b82f6',
					icon: null,
					folderId: null,
					itemCount: 1
				}
			]
		});

		render(ListsPage);

		await expect.element(page.getByText('1 item', { exact: true })).toBeInTheDocument();
	});

	it('opens the "+" popout to reveal Create List / Create Folder links', async () => {
		setToken('test-token');
		stubFetchByUrl({});

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Create' }).click();

		const newListLink = page.getByRole('link', { name: 'Create List' });
		await expect.element(newListLink).toBeInTheDocument();
		expect(newListLink.element().getAttribute('href')).toBe('/lists/new');

		const newFolderLink = page.getByRole('link', { name: 'Create Folder' });
		await expect.element(newFolderLink).toBeInTheDocument();
		expect(newFolderLink.element().getAttribute('href')).toBe('/lists/folders/new');
	});

	it('groups lists under two folders in sortOrder, and moves one list back to "Not in a folder"', async () => {
		setToken('test-token');
		const costco = {
			id: 1,
			name: 'Costco run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: 5,
			itemCount: 0
		};
		// A second list in the SAME folder as costco, so grouping exercises the
		// "bucket already exists" path, not just first-list-in-a-folder.
		const wholeFoods = {
			id: 3,
			name: 'Whole Foods run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: 5,
			itemCount: 0
		};
		const target = {
			id: 2,
			name: 'Target run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: 6,
			itemCount: 0
		};
		// Given out of sortOrder, so grouping into display order exercises the
		// comparator, not just a pass-through of already-sorted input.
		const household = {
			id: 6,
			userId: 1,
			name: 'Household',
			color: '#3b82f6',
			sortOrder: 1,
			version: 1
		};
		const groceries = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		stubFetchByUrl({
			lists: [costco, wholeFoods, target],
			folders: [household, groceries],
			updateList: { ...costco, folderId: null }
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries').first()).toBeInTheDocument();
		await expect.element(page.getByText('Household').first()).toBeInTheDocument();
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();
		await expect.element(page.getByText('Target run')).toBeInTheDocument();

		await expect
			.poll(() =>
				[...document.querySelectorAll('h2')].map((h) => h.querySelectorAll('span')[1]?.textContent)
			)
			.toEqual(['Groceries', 'Household']);

		await page.getByRole('button', { name: 'Close' }).first().click();

		await expect.element(page.getByText('Not in a folder')).toBeInTheDocument();
		await expect.element(page.getByText('Target run')).toBeInTheDocument();
	});

	it('reloads when moving a list to a folder fails without an ApiError', async () => {
		setToken('test-token');
		const list = {
			id: 1,
			name: 'Costco run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: null,
			itemCount: 0
		};
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const fetchMock = stubFetchByUrl({
			lists: [list],
			folders: [folder],
			updateListError: new TypeError('network down')
		});

		render(ListsPage);
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();

		await page.getByRole('combobox').selectOptions('5');

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => u.includes('/lists')).length)
			.toBe(3);
	});

	it('reloads when moving a list to a folder fails with an ApiError', async () => {
		setToken('test-token');
		const list = {
			id: 1,
			name: 'Costco run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: null,
			itemCount: 0
		};
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const fetchMock = stubFetchByUrl({
			lists: [list],
			folders: [folder],
			updateListError: { status: 500, message: 'Could not move list' }
		});

		render(ListsPage);
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();

		await page.getByRole('combobox').selectOptions('5');

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => u.includes('/lists')).length)
			.toBe(3);
	});

	it('deletes a folder, unfiling only the lists it contained', async () => {
		setToken('test-token');
		const filed = {
			id: 1,
			name: 'Costco run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: 5,
			itemCount: 0
		};
		const alreadyUnfiled = {
			id: 2,
			name: 'Errands',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: null,
			itemCount: 0
		};
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		stubFetchByUrl({ lists: [filed, alreadyUnfiled], folders: [folder] });

		render(ListsPage);
		await expect.element(page.getByText('Groceries').first()).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete folder' }).click();

		await expect.element(page.getByText('Groceries')).not.toBeInTheDocument();
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();
		await expect.element(page.getByText('Errands')).toBeInTheDocument();
	});

	it('reloads when deleting a folder fails without an ApiError', async () => {
		setToken('test-token');
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const fetchMock = stubFetchByUrl({
			folders: [folder],
			deleteFolderError: new TypeError('network down')
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete folder' }).click();

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => u.includes('/folders')).length)
			.toBe(3);
	});

	it('reloads when deleting a folder fails with an ApiError', async () => {
		setToken('test-token');
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const fetchMock = stubFetchByUrl({
			folders: [folder],
			deleteFolderError: { status: 500, message: 'Could not delete folder' }
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Delete folder' }).click();

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => u.includes('/folders')).length)
			.toBe(3);
	});

	function rows() {
		return page.getByRole('listitem');
	}

	const first = {
		id: 1,
		name: 'Groceries',
		archived: false,
		color: '#3b82f6',
		icon: null,
		folderId: null,
		itemCount: 0
	};
	const second = {
		id: 2,
		name: 'Hardware',
		archived: false,
		color: '#ef4444',
		icon: null,
		folderId: null,
		itemCount: 0
	};

	async function dragFirstBelowSecond() {
		const items = rows();
		const firstEl = items.first().element();
		const secondEl = items.nth(1).element();
		const secondRect = secondEl.getBoundingClientRect();

		firstEl.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		firstEl.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);
		firstEl.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);
	}

	it('reorders lists by dragging the first one below the second', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({
			lists: [first, second],
			reorderLists: [second, first]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await dragFirstBelowSecond();

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [2, 1] });
	});

	it('leaves a list in another folder section untouched by an unfiled-section drag', async () => {
		setToken('test-token');
		const inFolder = {
			id: 3,
			name: 'Camping',
			archived: false,
			color: '#22c55e',
			icon: null,
			folderId: 9,
			itemCount: 0
		};
		const folder = { id: 9, userId: 1, name: 'Trips', color: '#22c55e', sortOrder: 0, version: 1 };
		const fetchMock = stubFetchByUrl({
			lists: [inFolder, first, second],
			folders: [folder],
			reorderLists: [inFolder, second, first]
		});

		render(ListsPage);
		await expect.element(page.getByText('Camping')).toBeInTheDocument();

		// Folder groups render before the unfiled section, so the unfiled rows
		// are the 2nd and 3rd `listitem`s, not the 1st.
		const items = rows();
		const firstEl = items.nth(1).element();
		const secondEl = items.nth(2).element();
		const secondRect = secondEl.getBoundingClientRect();

		firstEl.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		firstEl.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);
		firstEl.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		// The foldered list (id 3) keeps its original slot; only the unfiled pair swaps.
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [3, 2, 1] });
	});

	it('reorders lists within a folder section by dragging the first one below the second', async () => {
		setToken('test-token');
		const tent = {
			id: 3,
			name: 'Tent',
			archived: false,
			color: '#22c55e',
			icon: null,
			folderId: 9,
			itemCount: 0
		};
		const stove = {
			id: 4,
			name: 'Stove',
			archived: false,
			color: '#22c55e',
			icon: null,
			folderId: 9,
			itemCount: 0
		};
		const folder = { id: 9, userId: 1, name: 'Trips', color: '#22c55e', sortOrder: 0, version: 1 };
		const fetchMock = stubFetchByUrl({
			lists: [tent, stove],
			folders: [folder],
			reorderLists: [stove, tent]
		});

		render(ListsPage);
		await expect.element(page.getByText('Tent')).toBeInTheDocument();

		const items = rows();
		const firstEl = items.first().element();
		const secondEl = items.nth(1).element();
		const secondRect = secondEl.getBoundingClientRect();

		firstEl.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
		);
		await delay(HOLD_MS + 50);
		firstEl.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);
		firstEl.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				pointerId: 1,
				clientX: 0,
				clientY: secondRect.top + secondRect.height + 1
			})
		);

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [4, 3] });
	});

	it('reloads when reordering lists fails without an ApiError', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({
			lists: [first, second],
			reorderListsError: new TypeError('network down')
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await dragFirstBelowSecond();

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists')).length)
			.toBe(3);
	});

	it('reloads when reordering lists fails with an ApiError', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({
			lists: [first, second],
			reorderListsError: { status: 500, message: 'Could not reorder' }
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		await dragFirstBelowSecond();

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists')).length)
			.toBe(3);
	});
});
