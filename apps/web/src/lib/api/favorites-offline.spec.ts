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

const { apiPost, apiPatch, apiDelete } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { createFavorite, updateFavorite, deleteFavorite } = await import('./favorites');

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
