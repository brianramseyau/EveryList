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
const { createItem, updateItem, deleteItem } = await import('./items');

afterEach(async () => {
	vi.clearAllMocks();
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

	it('guesses a categoryId from cached categories when none is given explicitly', async () => {
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

	it('leaves categoryId null when nothing matches the guess', async () => {
		let captured: number | null | undefined;
		vi.mocked(apiPost).mockImplementation(async () => {
			captured = await capturedOptimisticCategoryId();
			return { id: 42, name: 'xyzzy nonsense', version: 1 };
		});

		await createItem(1, { name: 'xyzzy nonsense' });

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
