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

const { apiGet, apiPost, apiPatch, apiDelete, ApiError } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { pendingMutations } = await import('$lib/offline/sync-queue');
const {
	createItem,
	updateItem,
	deleteItem,
	fetchItems,
	fetchRecentItemNames,
	fetchRecentItems,
	restoreItem
} = await import('./items');

afterEach(async () => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	await resetDbForTesting();
});

describe('createItem (Dexie available)', () => {
	it('writes an optimistic row and resolves the server response', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42, name: 'Bananas', version: 1 });

		const result = await createItem(1, { name: 'Bananas' });

		expect(result).toEqual({ id: 42, name: 'Bananas', version: 1 });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items', { name: 'Bananas' });
	});

	// Captures the optimistic Dexie row's categoryId at the moment apiPost is
	// invoked — by then offlineCreate has already written it (see
	// sync-engine.ts's offlineCreate: table.put happens before request()) —
	// rather than racing a timer against the write.
	async function capturedOptimisticCategoryId(): Promise<number | null | undefined> {
		const db = getDb()!;
		const [cached] = await db.items.toArray();
		return cached?.categoryId;
	}

	it('uses the personalized suggestion from the categorize endpoint when it succeeds', async () => {
		vi.mocked(apiGet).mockResolvedValue({ categoryId: 77 });
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createItem(1, { name: 'Bananas' });

		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/items/categorize?name=Bananas');
		expect(captured).toBe(77);
	});

	it('falls back to the static keyword table when the categorize endpoint fails (offline)', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: 1,
			isDefault: true,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiGet).mockRejectedValue(new TypeError('Failed to fetch'));
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async (...args) => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: (args[1] as { name: string }).name, version: 1 };
		});

		await createItem(1, { name: 'Bananas' });

		expect(captured).toBe(9);
	});

	it('falls back to a global-default category when no list-scoped match exists', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: null,
			isDefault: true,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createItem(1, { name: 'Bananas' });

		expect(captured).toBe(9);
	});

	it('falls back to a global-default category when no list-scoped match exists', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: null,
			isDefault: true,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createItem(1, { name: 'Bananas' });

		expect(captured).toBe(9);
	});

	it('leaves categoryId null when nothing matches the guess', async () => {
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'xyzzy nonsense', version: 1 };
		});

		await createItem(1, { name: 'xyzzy nonsense' });

		expect(captured).toBeNull();
	});

	it('uses the cached learned category before the static table when the categorize endpoint fails', async () => {
		const db = getDb()!;
		await db.categoryLearnings.put({
			listId: 1,
			learnings: [
				{ categoryId: 99, token: 'banana', count: 3, lastSeenAt: '2026-08-20T00:00:00.000Z' }
			]
		});
		vi.mocked(apiGet).mockRejectedValue(new TypeError('Failed to fetch'));
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createItem(1, { name: 'Bananas' });

		expect(captured).toBe(99);
	});

	it('falls back to the static table when the cached learned model has no matching token', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: 1,
			isDefault: true,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		await db.categoryLearnings.put({
			listId: 1,
			learnings: [
				{ categoryId: 99, token: 'apple', count: 3, lastSeenAt: '2026-08-20T00:00:00.000Z' }
			]
		});
		vi.mocked(apiGet).mockRejectedValue(new TypeError('Failed to fetch'));
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createItem(1, { name: 'Bananas' });

		expect(captured).toBe(9);
	});

	it('leaves categoryId null when the name tokenizes to nothing and the request fails', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('Failed to fetch'));
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: '123', version: 1 };
		});

		await createItem(1, { name: '123' });

		expect(captured).toBeNull();
	});

	it('respects an explicit categoryId over the guess', async () => {
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createItem(1, { name: 'Bananas', categoryId: 3 });

		expect(captured).toBe(3);
	});
});

describe('updateItem (Dexie available)', () => {
	it('applies the change to the cached row, including checkedAt when toggling checked', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 3
		});
		vi.mocked(apiPatch).mockResolvedValue({ id: 5, checked: true, version: 4 });

		await updateItem(1, 5, { checked: true });

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/5', { checked: true });
		const cached = await db.items.get(5);
		expect(cached?.checked).toBe(true);
		expect(cached?.checkedAt).not.toBeNull();
	});

	it('clears checkedAt when unchecking', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: true,
			checkedAt: '2026-08-01T00:00:00.000Z',
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 3
		});
		vi.mocked(apiPatch).mockResolvedValue({ id: 5, checked: false, version: 4 });

		await updateItem(1, 5, { checked: false });

		const cached = await db.items.get(5);
		expect(cached?.checkedAt).toBeNull();
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 999, version: 1 });
		await expect(updateItem(1, 999, { checked: true })).resolves.toEqual({ id: 999, version: 1 });
	});

	it('skips cache reconciliation when the server response is empty', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 3
		});
		vi.mocked(apiPatch).mockResolvedValue(undefined);

		await expect(updateItem(1, 5, { quantity: '2' })).resolves.toBeUndefined();

		const cached = await db.items.get(5);
		expect(cached?.quantity).toBe('2');
	});

	it('leaves checkedAt untouched when the update does not toggle checked', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: '1',
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: true,
			checkedAt: '2026-08-01T00:00:00.000Z',
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 3
		});
		vi.mocked(apiPatch).mockResolvedValue({ id: 5, quantity: '2', version: 4 });

		await updateItem(1, 5, { quantity: '2' });

		const cached = await db.items.get(5);
		expect(cached?.checkedAt).toBe('2026-08-01T00:00:00.000Z');
	});
});

describe('deleteItem (Dexie available)', () => {
	it('soft-deletes the cached row', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await deleteItem(1, 5);

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/5');
		const cached = await db.items.get(5);
		expect(cached?.deletedAt).not.toBeNull();
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		await expect(deleteItem(1, 999)).resolves.toBeUndefined();
	});
});

describe('restoreItem (Dexie available)', () => {
	it('clears the cached row deletedAt optimistically and adopts the server response on success', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: '2026-08-20T00:00:00.000Z',
			version: 1
		});
		vi.mocked(apiPost).mockResolvedValue({ id: 5, deletedAt: null, version: 2 });

		await restoreItem(1, 5);

		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items/5/restore');
		const cached = await db.items.get(5);
		expect(cached?.deletedAt).toBeNull();
		expect(cached?.version).toBe(2);
		expect(cached?._dirty).toBe(false);
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 999, deletedAt: null, version: 1 });
		await expect(restoreItem(1, 999)).resolves.toEqual({ id: 999, deletedAt: null, version: 1 });
	});

	it('skips cache reconciliation when the server response is empty', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: '2026-08-20T00:00:00.000Z',
			version: 1
		});
		vi.mocked(apiPost).mockResolvedValue(undefined);

		await expect(restoreItem(1, 5)).resolves.toBeUndefined();

		// The optimistic write already cleared `deletedAt` before the request fired — an empty
		// response just means there's no server row to reconcile onto it, not that the optimistic
		// state gets rolled back.
		const cached = await db.items.get(5);
		expect(cached?.deletedAt).toBeNull();
		expect(cached?.version).toBe(1);
	});
});

describe('fetchRecentItemNames', () => {
	it('returns the server response when the request succeeds', async () => {
		vi.mocked(apiGet).mockResolvedValue(['Bananas', 'Bread']);

		await expect(fetchRecentItemNames(1)).resolves.toEqual(['Bananas', 'Bread']);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/items/recent-names');
	});

	it('falls back to distinct, most-recent-first cached names for the list when the request fails', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		const db = getDb()!;
		const base = {
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		await db.items.put({
			...base,
			id: 1,
			listId: 1,
			name: 'Bananas',
			createdAt: '2026-08-01T00:00:00.000Z'
		});
		await db.items.put({
			...base,
			id: 2,
			listId: 1,
			name: 'bananas',
			createdAt: '2026-08-03T00:00:00.000Z'
		});
		await db.items.put({
			...base,
			id: 3,
			listId: 1,
			name: 'Bread',
			createdAt: '2026-08-02T00:00:00.000Z'
		});
		await db.items.put({
			...base,
			id: 4,
			listId: 2,
			name: 'Other list item',
			createdAt: '2026-08-04T00:00:00.000Z'
		});

		await expect(fetchRecentItemNames(1)).resolves.toEqual(['bananas', 'Bread']);
	});

	it('caps the offline fallback at 50 distinct names', async () => {
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));
		const db = getDb()!;
		const base = {
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			updatedAt: null,
			deletedAt: null,
			version: 1
		};
		for (let i = 0; i < 55; i++) {
			await db.items.put({
				...base,
				id: i + 1,
				listId: 1,
				name: `Item ${i}`,
				createdAt: `2026-08-01T00:${String(i).padStart(2, '0')}:00.000Z`
			});
		}

		const names = await fetchRecentItemNames(1);
		expect(names).toHaveLength(50);
	});
});

describe('fetchItems (cache hydration)', () => {
	it('caches fetched rows so a later offline edit reads their version', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 8, name: 'Milk', version: 7 }]);

		await fetchItems(1);

		expect((await getDb()!.items.get(8))?.version).toBe(7);
	});

	it('falls back to cached rows, sorted by sortOrder, when the network fails', async () => {
		vi.mocked(apiGet).mockResolvedValue([
			{ id: 9, listId: 1, name: 'Bread', sortOrder: 1 },
			{ id: 8, listId: 1, name: 'Milk', sortOrder: 0 }
		]);
		await fetchItems(1);
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchItems(1);

		expect(result.map((item) => item.id)).toEqual([8, 9]);
	});

	it('rethrows an ApiError without falling back to cache', async () => {
		await getDb()!.items.put({
			id: 8,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));

		await expect(fetchItems(1)).rejects.toThrow('Forbidden');
	});

	it('does not clobber a row with an unacked local edit during a re-fetch', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 8,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: true,
			checkedAt: '2026-08-17T00:00:00.000Z',
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 7,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 8, name: 'Milk', checked: false, version: 7 }]);

		await fetchItems(1);

		const cached = await db.items.get(8);
		expect(cached?.checked).toBe(true);
		expect(cached?._dirty).toBe(true);
	});

	it('records the cached version as expectedVersion when toggling offline', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 8, name: 'Milk', version: 7 }]);
		await fetchItems(1);
		vi.stubGlobal('navigator', { onLine: false });

		await updateItem(1, 8, { checked: true });

		const [mutation] = await pendingMutations();
		expect(mutation.expectedVersion).toBe(7);
	});

	it('merges a dirty local edit over the server copy in the returned list', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 8,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: true,
			checkedAt: '2026-08-17T00:00:00.000Z',
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 7,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 8, name: 'Milk', checked: false, version: 7 }]);

		const items = await fetchItems(1);

		expect(items).toHaveLength(1);
		expect(items[0].checked).toBe(true);
	});

	it('appends a locally-created (temp-id) row that the server has not seen yet', async () => {
		const db = getDb()!;
		await db.items.put({
			id: -1,
			listId: 1,
			name: 'Bread',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 999,
			createdBy: 0,
			createdAt: '2026-08-17T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: '-1',
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 8, name: 'Milk', version: 7 }]);

		const items = await fetchItems(1);

		expect(items.map((item) => item.id)).toEqual([8, -1]);
		expect(items.map((item) => item.name)).toEqual(['Milk', 'Bread']);
	});

	it('drops a soft-deleted local row so a stale server copy does not resurrect it', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 8,
			listId: 1,
			name: 'Milk',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: '2026-08-17T00:00:00.000Z',
			version: 7,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 8, name: 'Milk', version: 7 }]);

		const items = await fetchItems(1);

		expect(items).toHaveLength(0);
	});
});

describe('fetchRecentItems (cache hydration)', () => {
	it('caches fetched rows so a later offline restore reads their version', async () => {
		vi.mocked(apiGet).mockResolvedValue([
			{ id: 8, listId: 1, name: 'Milk', deletedAt: '2026-08-20T00:00:00.000Z', version: 7 }
		]);

		await fetchRecentItems(1);

		expect((await getDb()!.items.get(8))?.version).toBe(7);
	});

	it('does not clobber a row with an unacked local edit during a re-fetch', async () => {
		const db = getDb()!;
		await db.items.put({
			id: 8,
			listId: 1,
			name: 'Milk (edited)',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: '2026-08-20T00:00:00.000Z',
			version: 2,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([
			{ id: 8, listId: 1, name: 'Milk', deletedAt: '2026-08-20T00:00:00.000Z', version: 2 }
		]);

		await fetchRecentItems(1);

		expect((await db.items.get(8))?.name).toBe('Milk (edited)');
	});

	it('falls back to cached, soft-deleted rows for this list, most-recently-deleted first, when the network fails', async () => {
		const db = getDb()!;
		await db.items.bulkPut([
			{
				id: 8,
				listId: 1,
				name: 'Milk',
				quantity: null,
				notes: null,
				categoryId: null,
				storeId: null,
				price: null,
				checked: false,
				checkedAt: null,
				sortOrder: 0,
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: '2026-08-19T00:00:00.000Z',
				version: 1
			},
			{
				id: 9,
				listId: 1,
				name: 'Bread',
				quantity: null,
				notes: null,
				categoryId: null,
				storeId: null,
				price: null,
				checked: false,
				checkedAt: null,
				sortOrder: 0,
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: '2026-08-20T00:00:00.000Z',
				version: 1
			},
			{
				id: 10,
				listId: 1,
				name: 'Eggs',
				quantity: null,
				notes: null,
				categoryId: null,
				storeId: null,
				price: null,
				checked: false,
				checkedAt: null,
				sortOrder: 0,
				createdBy: 1,
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				deletedAt: null,
				version: 1
			}
		]);
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchRecentItems(1);

		expect(result.map((item) => item.id)).toEqual([9, 8]);
	});

	it('rethrows an ApiError without falling back to cache', async () => {
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));

		await expect(fetchRecentItems(1)).rejects.toThrow('Forbidden');
	});
});
