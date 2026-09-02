import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { getDb, resetDbForTesting } from '$lib/offline/db';
import type { SortableReorderParams } from '$lib/actions/sortable-reorder';

// See the item-list page's spec for why this is mocked: SortableJS's own
// drag mechanics aren't something a component test can reliably drive, so
// this test double lets tests invoke each section's onDrop handler directly.
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

const { goto } = await import('$app/navigation');
const ListsPage = (await import('./+page.svelte')).default;

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

	afterEach(async () => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		clearToken();
		// This suite exercises the real fetchLists/fetchFolders (only the underlying `fetch` is
		// stubbed, not $lib/api/lists), so — unlike most page specs — it writes into the browser's
		// real IndexedDB via Dexie. Without resetting, a row cached by one test's successful fetch
		// leaks into a later test's network-failure fallback assertion.
		await resetDbForTesting();
	});

	it('sets the document title', async () => {
		render(ListsPage);

		await expect.poll(() => document.title).toBe('My Lists — EveryList');
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

	it('prevents the browser context menu on a long-press of a list card', async () => {
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
					itemCount: 0
				}
			]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const card = page.getByText('Groceries').element().closest('a')!;
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		card.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
	});

	it('hides the drag handle on a coarse-pointer device', async () => {
		const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true,
			media: '(pointer: coarse)',
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		} as unknown as MediaQueryList);
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
					itemCount: 0
				}
			]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		const card = page.getByText('Groceries').element().closest('a')!;
		expect(card.querySelector('.w-6')).toBeNull();

		matchMediaSpy.mockRestore();
	});

	it('paints instantly from the Dexie cache, without waiting on the network revalidation', async () => {
		setToken('test-token');
		const db = getDb()!;
		await db.lists.put({
			id: 1,
			name: 'Groceries',
			color: '#3b82f6',
			icon: null,
			ownerId: 1,
			folderId: null,
			badgeExcluded: false,
			passcodeHash: null,
			archived: false,
			itemCount: 3,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			version: 1,
			_localSortOrder: 0
		});
		// Never resolves during this test — proves the cached paint above didn't wait on it.
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => {}))
		);

		render(ListsPage);

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('Loading…')).not.toBeInTheDocument();
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

	it('falls back to the empty state, not an error, when the network fails and nothing is cached', async () => {
		setToken('test-token');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		render(ListsPage);

		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();
	});

	it('shows a generic error message when the network fails and Dexie is unavailable', async () => {
		setToken('test-token');
		// fetchLists/fetchFolders only fall back to cached data when Dexie is available (see
		// $lib/api/cache-fallback.ts) — with no IndexedDB at all, there's truly nothing to show,
		// and the original non-ApiError network failure reaches the page's catch block unchanged.
		vi.stubGlobal('indexedDB', undefined);
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

	it('groups lists under two folders in sortOrder, and shows an empty-folder drop target', async () => {
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
			folders: [household, groceries]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries').first()).toBeInTheDocument();
		await expect.element(page.getByText('Household').first()).toBeInTheDocument();
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();
		await expect.element(page.getByText('Target run')).toBeInTheDocument();

		await expect
			.poll(() =>
				[...document.querySelectorAll('h2')]
					// Folder headers have a color-dot span plus a name span; "Not in
					// a folder" is plain text with no spans at all.
					.filter((h) => h.querySelectorAll('span').length >= 2)
					.map((h) => h.querySelectorAll('span')[1]?.textContent)
			)
			.toEqual(['Groceries', 'Household']);

		// Both lists are filed, so "Not in a folder" is still shown as an empty
		// drop target — the drag affordance is present even with nothing to drop.
		await expect.element(page.getByText('Not in a folder')).toBeInTheDocument();
		await expect
			.element(page.getByText('Drag a list here to remove it from its folder.'))
			.toBeInTheDocument();
	});

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

	// Invokes the onDrop handler SortableJS would have called on a real drop
	// (see the mock above). Every section's `<ul>` now shares one `onDrop`
	// function reference (unlike the item-level page, folder membership isn't
	// captured in a per-section closure — it's driven entirely by
	// `params.toContainerId`), so any rendered `<ul>` works as the pickup
	// point.
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

	it('reorders lists by dragging the first one below the second', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({
			lists: [first, second],
			reorderLists: [second, first]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		// Starting order is [Groceries(1), Hardware(2)]; drag Groceries below
		// Hardware, landing at the end, within the same (unfiled) section.
		triggerDrop({ itemId: 1, toContainerId: null, beforeItemId: 2, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [2, 1] });
		// No folder change, so only /lists/reorder was hit — no PATCH to /lists/:id.
		expect(
			fetchMock.mock.calls.filter(
				([u, i]) => /\/lists\/\d+$/.test(String(u)) && (i as RequestInit)?.method === 'PATCH'
			).length
		).toBe(0);
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

		// Drag Groceries below Hardware within the unfiled section only.
		triggerDrop({ itemId: 1, toContainerId: null, beforeItemId: 2, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		// The foldered list (id 3) keeps its original slot; only the unfiled pair swaps.
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [3, 2, 1] });
	});

	it('reorders lists by dragging the second one above the first', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({
			lists: [first, second],
			reorderLists: [second, first]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		triggerDrop({ itemId: 2, toContainerId: null, beforeItemId: null, afterItemId: 1 });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [2, 1] });
	});

	it('keeps a list in its original slot when the drop has no neighbors at all', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({
			lists: [first, second],
			reorderLists: [first, second]
		});

		render(ListsPage);
		await expect.element(page.getByText('Groceries')).toBeInTheDocument();

		// No before/after neighbor — insertAt falls back to the end.
		triggerDrop({ itemId: 1, toContainerId: null, beforeItemId: null, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);
		const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/lists/reorder'))!;
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ order: [2, 1] });
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

		triggerDrop({ itemId: 3, toContainerId: 9, beforeItemId: 4, afterItemId: null });

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

		triggerDrop({ itemId: 1, toContainerId: null, beforeItemId: 2, afterItemId: null });

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

		triggerDrop({ itemId: 1, toContainerId: null, beforeItemId: 2, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists')).length)
			.toBe(3);
	});

	it('drags a list into a different folder, patching folderId before reordering', async () => {
		setToken('test-token');
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const errands = {
			id: 1,
			name: 'Errands',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: null,
			itemCount: 0
		};
		const fetchMock = stubFetchByUrl({
			lists: [errands],
			folders: [folder],
			updateList: { ...errands, folderId: 5 },
			reorderLists: [{ ...errands, folderId: 5 }]
		});

		render(ListsPage);
		await expect.element(page.getByText('Errands')).toBeInTheDocument();

		// Drop into the (empty) "Groceries" folder section.
		triggerDrop({ itemId: 1, toContainerId: 5, beforeItemId: null, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists/reorder')).length)
			.toBe(1);

		const patchCall = fetchMock.mock.calls.find(
			([u, i]) => String(u).includes('/lists/1') && (i as RequestInit)?.method === 'PATCH'
		)!;
		expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toEqual({ folderId: 5 });

		const [, reorderInit] = fetchMock.mock.calls.find(([u]) =>
			String(u).includes('/lists/reorder')
		)!;
		expect(JSON.parse((reorderInit as RequestInit).body as string)).toEqual({ order: [1] });
	});

	it('reloads when dragging a list into a different folder fails without an ApiError', async () => {
		setToken('test-token');
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const list = {
			id: 1,
			name: 'Costco run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: null,
			itemCount: 0
		};
		const fetchMock = stubFetchByUrl({
			lists: [list],
			folders: [folder],
			updateListError: new TypeError('network down')
		});

		render(ListsPage);
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();

		triggerDrop({ itemId: 1, toContainerId: 5, beforeItemId: null, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists')).length)
			.toBe(3);
	});

	it('reloads when dragging a list into a different folder fails with an ApiError', async () => {
		setToken('test-token');
		const folder = {
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			version: 1
		};
		const list = {
			id: 1,
			name: 'Costco run',
			archived: false,
			color: '#3b82f6',
			icon: null,
			folderId: null,
			itemCount: 0
		};
		const fetchMock = stubFetchByUrl({
			lists: [list],
			folders: [folder],
			updateListError: { status: 500, message: 'Could not move list' }
		});

		render(ListsPage);
		await expect.element(page.getByText('Costco run')).toBeInTheDocument();

		triggerDrop({ itemId: 1, toContainerId: 5, beforeItemId: null, afterItemId: null });

		await expect
			.poll(() => fetchMock.mock.calls.filter(([u]) => String(u).includes('/lists')).length)
			.toBe(3);
	});
});
