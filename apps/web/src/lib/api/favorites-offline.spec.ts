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

const { apiGet, apiPost, apiPatch, apiDelete } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { createFavorite, updateFavorite, deleteFavorite, fetchFavorites, addFavoriteToList } =
	await import('./favorites');

function setOnline(online: boolean) {
	Object.defineProperty(globalThis, 'navigator', {
		value: { onLine: online },
		configurable: true
	});
}

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

describe('createFavorite (Dexie available)', () => {
	it('writes an optimistic row and resolves the server response', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42, name: 'Bananas', version: 1 });

		const result = await createFavorite(1, { name: 'Bananas', defaultQuantity: '1 bunch' });

		expect(result).toEqual({ id: 42, name: 'Bananas', version: 1 });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/favorites', {
			name: 'Bananas',
			defaultQuantity: '1 bunch'
		});
	});

	it('defaults the optimistic row quantity to null when none is given', async () => {
		let captured: string | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			const db = getDb()!;
			const [cached] = await db.favoriteItems.toArray();
			captured = cached?.defaultQuantity;
			return { id: 42, name: 'Bananas', version: 1 };
		});

		await createFavorite(1, { name: 'Bananas' });

		expect(captured).toBeNull();
	});
});

describe('updateFavorite (Dexie available)', () => {
	it('merges the server response into the cached row on success', async () => {
		const db = getDb()!;
		await db.favoriteItems.put({
			id: 5,
			userId: 1,
			listId: 1,
			name: 'Bananas',
			defaultCategoryId: null,
			defaultQuantity: '1 bunch',
			storeId: null,
			notes: null,
			price: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPatch).mockResolvedValue({ id: 5, defaultQuantity: '2 bunches', version: 2 });

		await updateFavorite(1, 5, { defaultQuantity: '2 bunches' });

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/favorites/5', {
			defaultQuantity: '2 bunches'
		});
		const cached = await db.favoriteItems.get(5);
		expect(cached?.defaultQuantity).toBe('2 bunches');
		expect(cached?.version).toBe(2);
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 999, version: 1 });
		await expect(updateFavorite(1, 999, { name: 'X' })).resolves.toEqual({ id: 999, version: 1 });
	});

	it('skips cache reconciliation when the server response is empty', async () => {
		const db = getDb()!;
		await db.favoriteItems.put({
			id: 5,
			userId: 1,
			listId: 1,
			name: 'Bananas',
			defaultCategoryId: null,
			defaultQuantity: '1 bunch',
			storeId: null,
			notes: null,
			price: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPatch).mockResolvedValue(undefined);

		await expect(updateFavorite(1, 5, { defaultQuantity: '2 bunches' })).resolves.toBeUndefined();

		const cached = await db.favoriteItems.get(5);
		expect(cached?.defaultQuantity).toBe('2 bunches');
	});
});

describe('deleteFavorite (Dexie available)', () => {
	it('soft-deletes the cached row', async () => {
		const db = getDb()!;
		await db.favoriteItems.put({
			id: 5,
			userId: 1,
			listId: 1,
			name: 'Bananas',
			defaultCategoryId: null,
			defaultQuantity: null,
			storeId: null,
			notes: null,
			price: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await deleteFavorite(1, 5);

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/favorites/5');
		const cached = await db.favoriteItems.get(5);
		expect(cached?.deletedAt).not.toBeNull();
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		await expect(deleteFavorite(1, 999)).resolves.toBeUndefined();
	});
});

describe('fetchFavorites (cache hydration)', () => {
	it('caches fetched rows so a later offline edit reads their version', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 5, name: 'Bananas', version: 2 }]);

		await fetchFavorites(1);

		expect((await getDb()!.favoriteItems.get(5))?.version).toBe(2);
	});

	it('does not clobber a row with an unacked local edit during a re-fetch', async () => {
		const db = getDb()!;
		await db.favoriteItems.put({
			id: 5,
			userId: 1,
			listId: 1,
			name: 'Bananas (edited)',
			defaultCategoryId: null,
			defaultQuantity: null,
			storeId: null,
			notes: null,
			price: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 2,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 5, name: 'Bananas', version: 2 }]);

		await fetchFavorites(1);

		expect((await db.favoriteItems.get(5))?.name).toBe('Bananas (edited)');
	});
});

describe('addFavoriteToList (Dexie available)', () => {
	it('builds the optimistic item from an already-cached favorite and resolves the server response', async () => {
		const db = getDb()!;
		await db.favoriteItems.put({
			id: 5,
			userId: 1,
			listId: 1,
			name: 'Bananas',
			defaultCategoryId: 3,
			defaultQuantity: '1 bunch',
			storeId: 7,
			notes: 'ripe',
			price: 199,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPost).mockResolvedValue({ id: 42, listId: 1, name: 'Bananas', version: 1 });

		const result = await addFavoriteToList(1, 5);

		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/favorites/5/add-to-list');
		expect(result).toEqual({ id: 42, listId: 1, name: 'Bananas', version: 1 });
	});

	it('falls back to a generic placeholder when the favorite was never cached locally', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 43, listId: 1, name: 'Milk', version: 1 });

		const result = await addFavoriteToList(1, 999);

		expect(result).toEqual({ id: 43, listId: 1, name: 'Milk', version: 1 });
	});

	it('queues an attach mutation and returns the optimistic item when offline', async () => {
		const db = getDb()!;
		await db.favoriteItems.put({
			id: 5,
			userId: 1,
			listId: 1,
			name: 'Bananas',
			defaultCategoryId: null,
			defaultQuantity: null,
			storeId: null,
			notes: null,
			price: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		setOnline(false);

		const result = await addFavoriteToList(1, 5);

		expect(result).toMatchObject({ name: 'Bananas', listId: 1 });
		expect(result.id).toBeLessThan(0);
		setOnline(true);
	});
});
