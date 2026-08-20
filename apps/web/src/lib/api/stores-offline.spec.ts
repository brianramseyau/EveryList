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

const { apiGet, apiPost, apiPatch } = await import('./client');
const { getDb, resetDbForTesting } = await import('$lib/offline/db');
const { attachStore, updateStore, fetchStores } = await import('./stores');

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
});
