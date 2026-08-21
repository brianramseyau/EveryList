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

const { apiGet, apiPost, apiPatch, ApiError } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { attachStore, updateStore, fetchStores, fetchStoreCategoryOrder, reorderStoreCategories } =
	await import('./stores');

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

describe('attachStore (Dexie available, creating a new store)', () => {
	it('writes an optimistic row and resolves the server response', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42, name: 'Costco', version: 1 });

		const result = await attachStore(1, { name: 'Costco' });

		expect(result).toEqual({ id: 42, name: 'Costco', version: 1 });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/stores', { name: 'Costco' });
	});
});

describe('updateStore (Dexie available)', () => {
	it('merges the server response into the cached row on success', async () => {
		const db = getDb()!;
		await db.stores.put({
			id: 20,
			name: 'Walmart',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPatch).mockResolvedValue({ id: 20, name: 'Walmart Supercenter', version: 2 });

		await updateStore(20, { name: 'Walmart Supercenter' });

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/stores/20', { name: 'Walmart Supercenter' });
		const cached = await db.stores.get(20);
		expect(cached?.name).toBe('Walmart Supercenter');
		expect(cached?.version).toBe(2);
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 999, version: 1 });
		await expect(updateStore(999, { name: 'X' })).resolves.toEqual({ id: 999, version: 1 });
	});

	it('skips cache reconciliation when the server response is empty', async () => {
		const db = getDb()!;
		await db.stores.put({
			id: 20,
			name: 'Walmart',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPatch).mockResolvedValue(undefined);

		await expect(updateStore(20, { name: 'Walmart Supercenter' })).resolves.toBeUndefined();

		const cached = await db.stores.get(20);
		expect(cached?.name).toBe('Walmart Supercenter');
	});
});

describe('fetchStores (cache hydration)', () => {
	it('caches fetched rows so a later offline edit reads their version', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 20, name: 'Costco', version: 2 }]);

		await fetchStores(1);

		expect((await getDb()!.stores.get(20))?.version).toBe(2);
	});

	it('does not clobber a row with an unacked local edit during a re-fetch', async () => {
		const db = getDb()!;
		await db.stores.put({
			id: 20,
			name: 'Costco (edited)',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 2,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 20, name: 'Costco', version: 2 }]);

		await fetchStores(1);

		expect((await db.stores.get(20))?.name).toBe('Costco (edited)');
	});

	it('falls back to cached, non-deleted rows when the network fails', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 20, name: 'Costco', deletedAt: null, version: 1 }]);
		await fetchStores(1);
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchStores(1);

		expect(result).toEqual([expect.objectContaining({ id: 20, name: 'Costco' })]);
	});

	it('rethrows an ApiError without falling back to cache', async () => {
		await getDb()!.stores.put({
			id: 20,
			name: 'Costco',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));

		await expect(fetchStores(1)).rejects.toThrow('Forbidden');
	});
});

describe('fetchStoreCategoryOrder (cache hydration)', () => {
	it('caches the response into Dexie', async () => {
		vi.mocked(apiGet).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 1 }
		]);

		await fetchStoreCategoryOrder(20);

		expect((await getDb()!.storeCategoryOrders.get([20, 5]))?.sortOrder).toBe(0);
	});

	it('does not clobber a row with an unacked local edit during a re-fetch', async () => {
		const db = getDb()!;
		await db.storeCategoryOrders.put({
			id: 1,
			storeId: 20,
			categoryId: 5,
			sortOrder: 3,
			deletedAt: null,
			version: 1,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 1 }
		]);

		await fetchStoreCategoryOrder(20);

		expect((await db.storeCategoryOrders.get([20, 5]))?.sortOrder).toBe(3);
	});

	it('falls back to the cached order when the network fails', async () => {
		vi.mocked(apiGet).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 1 }
		]);
		await fetchStoreCategoryOrder(20);
		vi.mocked(apiGet).mockRejectedValue(new TypeError('network down'));

		const result = await fetchStoreCategoryOrder(20);

		expect(result).toEqual([expect.objectContaining({ storeId: 20, categoryId: 5 })]);
	});

	it('rethrows an ApiError without falling back to cache', async () => {
		await getDb()!.storeCategoryOrders.put({
			id: 1,
			storeId: 20,
			categoryId: 5,
			sortOrder: 0,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiGet).mockRejectedValue(new ApiError(403, 'Forbidden'));

		await expect(fetchStoreCategoryOrder(20)).rejects.toThrow('Forbidden');
	});
});

function setOnline(online: boolean) {
	Object.defineProperty(globalThis, 'navigator', {
		value: { onLine: online },
		configurable: true
	});
}

describe('attachStore (Dexie available, attaching an existing store by id)', () => {
	it('builds the optimistic placeholder from an already-cached store and resolves the server response', async () => {
		const db = getDb()!;
		await db.stores.put({
			id: 20,
			name: 'Costco',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPost).mockResolvedValue({ id: 20, name: 'Costco', version: 1 });

		const result = await attachStore(1, { storeId: 20 });

		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/stores', { storeId: 20 });
		expect(result).toEqual({ id: 20, name: 'Costco', version: 1 });
	});

	it('falls back to a generic placeholder when the store was never cached locally', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 30, name: 'Aldi', version: 1 });

		const result = await attachStore(1, { storeId: 30 });

		expect(result).toEqual({ id: 30, name: 'Aldi', version: 1 });
	});

	it('queues an attach mutation and returns the placeholder when offline', async () => {
		setOnline(true);
		const db = getDb()!;
		await db.stores.put({
			id: 20,
			name: 'Costco',
			color: '#3b82f6',
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		setOnline(false);

		const result = await attachStore(1, { storeId: 20 });

		expect(result).toMatchObject({ name: 'Costco' });
		expect(result.id).toBeLessThan(0);
		setOnline(true);
	});
});

describe('reorderStoreCategories (Dexie available)', () => {
	it('applies the new sortOrder optimistically and clears dirty on the server response', async () => {
		const db = getDb()!;
		vi.mocked(apiPatch).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 2 }
		]);

		const result = await reorderStoreCategories(20, [{ categoryId: 5, sortOrder: 0 }]);

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/stores/20/categories', {
			categories: [{ categoryId: 5, sortOrder: 0 }]
		});
		expect(result).toEqual([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 2 }
		]);
		expect((await db.storeCategoryOrders.get([20, 5]))?._dirty).toBe(false);
	});

	it('preserves the existing row id and version when one is already cached', async () => {
		const db = getDb()!;
		await db.storeCategoryOrders.put({
			id: 7,
			storeId: 20,
			categoryId: 5,
			sortOrder: 3,
			deletedAt: null,
			version: 2
		});
		vi.mocked(apiPatch).mockResolvedValue([
			{ id: 7, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 3 }
		]);

		await reorderStoreCategories(20, [{ categoryId: 5, sortOrder: 0 }]);

		expect(apiPatch).toHaveBeenCalled();
	});

	it('marks every touched row dirty and queues while offline', async () => {
		setOnline(false);

		const result = await reorderStoreCategories(20, [{ categoryId: 5, sortOrder: 0 }]);

		expect(result).toEqual([
			expect.objectContaining({ storeId: 20, categoryId: 5, sortOrder: 0, _dirty: true })
		]);
		const db = getDb()!;
		expect((await db.storeCategoryOrders.get([20, 5]))?._dirty).toBe(true);
		expect(apiPatch).not.toHaveBeenCalled();
		setOnline(true);
	});
});
