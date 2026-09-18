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
const { pendingMutations } = await import('$lib/offline/sync-queue');
const { createSubItem, updateSubItem, deleteSubItem, moveSubItem, fetchSubItems } =
	await import('./sub-items');

afterEach(async () => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	await resetDbForTesting();
});

describe('createSubItem (Dexie available)', () => {
	it('writes an optimistic row and resolves the server response', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42, itemId: 5, name: 'Sweep', version: 1 });

		const result = await createSubItem(1, 5, 'Sweep');

		expect(result).toEqual({ id: 42, itemId: 5, name: 'Sweep', version: 1 });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items/5/subtasks', { name: 'Sweep' });
	});

	it('caches the optimistic row under a temp id before the request resolves', async () => {
		const db = getDb()!;
		let cachedAtRequestTime: unknown;
		vi.mocked(apiPost).mockImplementation(async () => {
			const rows = await db.subItems.toArray();
			cachedAtRequestTime = rows[0];
			return { id: 42, itemId: 5, name: 'Sweep', version: 1 };
		});

		await createSubItem(1, 5, 'Sweep');

		expect(cachedAtRequestTime).toMatchObject({ itemId: 5, name: 'Sweep', checked: false });
	});
});

describe('updateSubItem (Dexie available)', () => {
	const baseSubItem = {
		id: 9,
		itemId: 5,
		name: 'Sweep',
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	};

	it('applies the change to the cached row, setting checkedAt when checking', async () => {
		const db = getDb()!;
		await db.subItems.put(baseSubItem);
		vi.mocked(apiPatch).mockResolvedValue({
			...baseSubItem,
			checked: true,
			checkedAt: '2026-08-01T00:00:00.000Z',
			version: 2
		});

		await updateSubItem(1, 5, 9, { checked: true });

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/5/subtasks/9', {
			checked: true
		});
		const cached = await db.subItems.get(9);
		expect(cached?.checked).toBe(true);
		expect(cached?.checkedAt).not.toBeNull();
	});

	it('clears checkedAt when unchecking', async () => {
		const db = getDb()!;
		await db.subItems.put({ ...baseSubItem, checked: true, checkedAt: '2026-08-01T00:00:00.000Z' });
		vi.mocked(apiPatch).mockResolvedValue({ ...baseSubItem, checked: false, version: 2 });

		await updateSubItem(1, 5, 9, { checked: false });

		const cached = await db.subItems.get(9);
		expect(cached?.checkedAt).toBeNull();
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 999, version: 1 });
		await expect(updateSubItem(1, 5, 999, { checked: true })).resolves.toEqual({
			id: 999,
			version: 1
		});
	});
});

describe('deleteSubItem (Dexie available)', () => {
	const baseSubItem = {
		id: 9,
		itemId: 5,
		name: 'Sweep',
		checked: false,
		checkedAt: null,
		sortOrder: 0,
		createdBy: 1,
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	};

	it('hard-deletes the cached row immediately, unlike an item soft-delete', async () => {
		const db = getDb()!;
		await db.subItems.put(baseSubItem);
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await deleteSubItem(1, 5, 9);

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/5/subtasks/9');
		expect(await db.subItems.get(9)).toBeUndefined();
	});

	it('stays queued and removed from Dexie while offline', async () => {
		const db = getDb()!;
		await db.subItems.put(baseSubItem);
		vi.stubGlobal('navigator', { onLine: false });

		await deleteSubItem(1, 5, 9);

		expect(await db.subItems.get(9)).toBeUndefined();
		expect(await pendingMutations()).toHaveLength(1);
		expect(apiDelete).not.toHaveBeenCalled();
	});
});

describe('moveSubItem / fetchSubItems', () => {
	it('moveSubItem hits the move endpoint directly (not offline-queued)', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 9, itemId: 5, sortOrder: 2, version: 2 });

		await moveSubItem(1, 5, 9, 7);

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/5/subtasks/9/move', {
			previousSubItemId: 7
		});
	});

	it('fetchSubItems hits the index endpoint', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 9, itemId: 5, name: 'Sweep' }]);

		await expect(fetchSubItems(1, 5)).resolves.toEqual([{ id: 9, itemId: 5, name: 'Sweep' }]);
		expect(apiGet).toHaveBeenCalledWith('/api/v1/lists/1/items/5/subtasks');
	});
});
