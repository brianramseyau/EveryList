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
const { pendingMutations, enqueueMutation } = await import('$lib/offline/sync-queue');
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

describe('createSubItem — deleted while its request is in flight', () => {
	it('queues a delete for the server copy when the temp row is removed before the POST resolves', async () => {
		const db = getDb()!;
		vi.mocked(apiPost).mockImplementation(async () => {
			// The user deletes the still-temp row while the POST is in flight.
			const [row] = await db.subItems.toArray();
			await deleteSubItem(1, 5, row!.id);
			return { id: 42, itemId: 5, name: 'Sweep', version: 1 };
		});
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await createSubItem(1, 5, 'Sweep');

		await vi.waitFor(() =>
			expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/5/subtasks/42')
		);
		expect(await db.subItems.toArray()).toEqual([]);
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

	it('leaves checkedAt untouched when the update does not toggle checked', async () => {
		const db = getDb()!;
		await db.subItems.put({ ...baseSubItem, checked: true, checkedAt: '2026-08-01T00:00:00.000Z' });
		vi.mocked(apiPatch).mockResolvedValue({
			...baseSubItem,
			name: 'Sweep floor',
			checked: true,
			checkedAt: '2026-08-01T00:00:00.000Z',
			version: 2
		});

		await updateSubItem(1, 5, 9, { name: 'Sweep floor' });

		const cached = await db.subItems.get(9);
		expect(cached?.name).toBe('Sweep floor');
		expect(cached?.checkedAt).toBe('2026-08-01T00:00:00.000Z');
	});

	it('skips cache reconciliation when the server response is empty', async () => {
		const db = getDb()!;
		await db.subItems.put(baseSubItem);
		vi.mocked(apiPatch).mockResolvedValue(undefined);

		await expect(updateSubItem(1, 5, 9, { name: 'Sweep floor' })).resolves.toBeUndefined();

		expect((await db.subItems.get(9))?._dirty).toBe(true);
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

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		await expect(deleteSubItem(1, 5, 999)).resolves.toBeUndefined();
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

describe('deleteSubItem — cached parent and unflushed creates', () => {
	const subItem = (id: number, itemId = 5) => ({
		id,
		itemId,
		name: `Sub ${id}`,
		checked: false,
		checkedAt: null,
		sortOrder: id,
		createdBy: 1,
		createdAt: '2026-08-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	});
	const parent = (subItems: ReturnType<typeof subItem>[]) => ({
		id: 5,
		listId: 1,
		name: 'Clean garage',
		subItems
	});

	it('drops the sub-task from its parent item’s cached nested array once the delete round-trips', async () => {
		const db = getDb()!;
		await db.items.put(parent([subItem(9), subItem(10)]) as never);
		await db.subItems.put(subItem(9));
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await deleteSubItem(1, 5, 9);

		expect((await db.items.get(5))!.subItems!.map((row) => row.id)).toEqual([10]);
	});

	it('drops a temp-id sub-task locally without queueing a delete, leaving its create to the flush loop', async () => {
		const db = getDb()!;
		await db.subItems.put(subItem(-3));
		await enqueueMutation({
			entityType: 'sub_item',
			op: 'create',
			targetId: -3,
			expectedVersion: null,
			payload: { name: 'Sub -3', listId: 1 },
			url: '/api/v1/lists/1/items/5/subtasks'
		});

		await deleteSubItem(1, 5, -3);

		expect(await db.subItems.get(-3)).toBeUndefined();
		const queued = await pendingMutations();
		expect(queued.map((row) => row.op)).toEqual(['create']);
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
