import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';

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
	createFolder?: unknown;
	createFolderError?: { status: number; message?: string } | Error;
	deleteFolderError?: { status: number; message?: string } | Error;
	updateList?: unknown;
	updateListError?: { status: number; message?: string } | Error;
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
		if (url.includes('/folders') && init?.method === 'POST') {
			if (routes.createFolderError instanceof Error)
				return Promise.reject(routes.createFolderError);
			if (routes.createFolderError) return errorResponse(routes.createFolderError);
			return Promise.resolve(jsonResponse(routes.createFolder));
		}
		if (url.includes('/folders')) return Promise.resolve(jsonResponse(routes.folders ?? []));
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

	it('links the "New list" button to the dedicated creation screen', async () => {
		setToken('test-token');
		stubFetchByUrl({});

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		const newListLink = page.getByRole('link', { name: 'New list' });
		await expect.element(newListLink).toBeInTheDocument();
		expect(newListLink.element().getAttribute('href')).toBe('/lists/new');
	});

	it('creates a new folder from the form', async () => {
		setToken('test-token');
		stubFetchByUrl({
			createFolder: {
				id: 5,
				userId: 1,
				name: 'Groceries',
				color: '#3b82f6',
				sortOrder: 0,
				version: 1
			}
		});

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		await page.getByPlaceholder('New folder name').fill('Groceries');
		await page.getByRole('button', { name: 'New folder' }).click();

		await expect.element(page.getByText('Groceries')).toBeInTheDocument();
		await expect.element(page.getByText('No lists in this folder yet.')).toBeInTheDocument();
	});

	it('does not submit when the new folder name is only whitespace', async () => {
		setToken('test-token');
		const fetchMock = stubFetchByUrl({});

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		const input = page.getByPlaceholder('New folder name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => fetchMock.mock.calls.length).toBe(2);
	});

	it('shows a generic error message when creating a folder fails without an ApiError', async () => {
		setToken('test-token');
		stubFetchByUrl({ createFolderError: new TypeError('network down') });

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		await page.getByPlaceholder('New folder name').fill('Groceries');
		await page.getByRole('button', { name: 'New folder' }).click();

		await expect.element(page.getByText('Failed to create folder.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a folder fails', async () => {
		setToken('test-token');
		stubFetchByUrl({ createFolderError: { status: 422, message: 'Name already exists' } });

		render(ListsPage);
		await expect.element(page.getByText('No lists yet — tap + to create one.')).toBeInTheDocument();

		await page.getByPlaceholder('New folder name').fill('Groceries');
		await page.getByRole('button', { name: 'New folder' }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
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
});
