import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn(),
	apiDelete: vi.fn(),
	ApiError: class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
}));

const { apiGet } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { fetchList, fetchLists } = await import('./lists');

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

function listRow(id: number, name: string) {
	return {
		id,
		name,
		color: '#3b82f6',
		icon: null,
		ownerId: 1,
		folderId: null,
		badgeExcluded: false,
		passcodeHash: null,
		archived: false,
		itemCount: 0,
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	};
}

describe('fetchLists (cache hydration)', () => {
	it('caches the response into Dexie with _localSortOrder positions', async () => {
		vi.mocked(apiGet).mockResolvedValue([listRow(2, 'Groceries'), listRow(1, 'Chores')]);

		await fetchLists();

		const db = getDb()!;
		expect((await db.lists.get(2))?._localSortOrder).toBe(0);
		expect((await db.lists.get(1))?._localSortOrder).toBe(1);
	});

	it('falls back to the cached lists, in their last-known order, when the network fails', async () => {
		vi.mocked(apiGet).mockResolvedValue([listRow(2, 'Groceries'), listRow(1, 'Chores')]);
		await fetchLists();
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchLists();

		expect(result.map((list) => list.id)).toEqual([2, 1]);
	});

	it('resolves to an empty array, not a rethrow, when the network fails and nothing is cached', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		await expect(fetchLists()).resolves.toEqual([]);
	});

	it('treats a row with no _localSortOrder (e.g. cached only via fetchList) as position 0', async () => {
		// fetchList preserves an existing row's _localSortOrder, which is undefined for a row
		// that's never been through a fetchLists call — this fallback sort must still order it
		// sensibly rather than sorting `undefined` against a real number, regardless of which
		// side of the comparison it lands on.
		await getDb()!.lists.put(listRow(3, 'Uncategorized A'));
		await getDb()!.lists.put(listRow(4, 'Uncategorized B'));
		await getDb()!.lists.put({ ...listRow(1, 'Groceries'), _localSortOrder: 1 });
		await getDb()!.lists.put({ ...listRow(2, 'Chores'), _localSortOrder: 0 });
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchLists();

		// The two undefined-order rows (treated as position 0) and the explicit-0 row are all
		// tied for first; the only firm guarantee is that the explicit-1 row sorts last.
		expect(result.map((list) => list.id)).toContain(3);
		expect(result.map((list) => list.id)).toContain(4);
		expect(result[result.length - 1].id).toBe(1);
	});
});

describe('fetchList (cache hydration)', () => {
	it('caches the fetched row without clobbering its existing _localSortOrder', async () => {
		await getDb()!.lists.put({ ...listRow(1, 'Groceries'), _localSortOrder: 3 });
		vi.mocked(apiGet).mockResolvedValue(listRow(1, 'Groceries (renamed)'));

		await fetchList(1);

		const cached = await getDb()!.lists.get(1);
		expect(cached?.name).toBe('Groceries (renamed)');
		expect(cached?._localSortOrder).toBe(3);
	});

	it('falls back to the cached row when the network fails', async () => {
		vi.mocked(apiGet).mockResolvedValue(listRow(1, 'Groceries'));
		await fetchList(1);
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		await expect(fetchList(1)).resolves.toEqual(expect.objectContaining({ name: 'Groceries' }));
	});

	it('rethrows when the row was never cached and the network fails', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		await expect(fetchList(1)).rejects.toThrow('network down');
	});
});
