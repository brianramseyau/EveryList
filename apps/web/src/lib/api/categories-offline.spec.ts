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
const { createCategory, updateCategory, deleteCategory, fetchCategories } =
	await import('./categories');

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

describe('createCategory (Dexie available)', () => {
	it('writes an optimistic row and resolves the server response', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42, name: 'Snacks', icon: 'cookie', version: 1 });

		const result = await createCategory(1, { name: 'Snacks', icon: 'cookie' });

		expect(result).toEqual({ id: 42, name: 'Snacks', icon: 'cookie', version: 1 });
		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/categories', {
			name: 'Snacks',
			icon: 'cookie'
		});
	});
});

describe('updateCategory (Dexie available)', () => {
	it('merges the server response into the cached row on success', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: 1,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPatch).mockResolvedValue({ id: 9, name: 'Fruit & Veg', version: 2 });

		await updateCategory(1, 9, { name: 'Fruit & Veg' });

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/categories/9', { name: 'Fruit & Veg' });
		const cached = await db.categories.get(9);
		expect(cached?.name).toBe('Fruit & Veg');
		expect(cached?.version).toBe(2);
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 999, version: 1 });
		await expect(updateCategory(1, 999, { name: 'X' })).resolves.toEqual({ id: 999, version: 1 });
	});

	it('skips cache reconciliation when the server response is empty', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: 1,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiPatch).mockResolvedValue(undefined);

		await expect(updateCategory(1, 9, { name: 'Fruit & Veg' })).resolves.toBeUndefined();

		const cached = await db.categories.get(9);
		expect(cached?.name).toBe('Fruit & Veg');
	});
});

describe('deleteCategory (Dexie available)', () => {
	it('soft-deletes the cached row', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 0,
			listId: 1,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await deleteCategory(1, 9);

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/categories/9');
		const cached = await db.categories.get(9);
		expect(cached?.deletedAt).not.toBeNull();
	});

	it('is a no-op against Dexie when the row was never cached', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		await expect(deleteCategory(1, 999)).resolves.toBeUndefined();
	});
});

describe('fetchCategories (cache hydration)', () => {
	it('caches fetched rows so a later offline edit reads their version', async () => {
		vi.mocked(apiGet).mockResolvedValue([{ id: 9, name: 'Produce', version: 2 }]);

		await fetchCategories(1);

		expect((await getDb()!.categories.get(9))?.version).toBe(2);
	});

	it('does not clobber a row with an unacked local edit during a re-fetch', async () => {
		const db = getDb()!;
		await db.categories.put({
			id: 9,
			name: 'Produce (edited)',
			icon: 'fruit',
			sortOrder: 0,
			listId: 1,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 2,
			_dirty: true
		});
		vi.mocked(apiGet).mockResolvedValue([{ id: 9, name: 'Produce', version: 2 }]);

		await fetchCategories(1);

		expect((await db.categories.get(9))?.name).toBe('Produce (edited)');
	});
});
