import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, hasIndexedDb, isRowDirty, resetDbForTesting } from './db';

describe('hasIndexedDb', () => {
	it('is true once the fake-indexeddb polyfill is installed', () => {
		expect(hasIndexedDb()).toBe(true);
	});
});

describe('getDb', () => {
	afterEach(async () => {
		await resetDbForTesting();
	});

	it('lazily constructs a singleton Dexie database', () => {
		const first = getDb();
		const second = getDb();
		expect(first).not.toBeNull();
		expect(second).toBe(first);
	});

	it('declares every table the offline layer needs', async () => {
		const db = getDb();
		expect(db).not.toBeNull();
		await db!.open();
		const tableNames = db!.tables.map((table) => table.name).sort();
		expect(tableNames).toEqual(
			[
				'categories',
				'favoriteItems',
				'items',
				'lists',
				'selectedStore',
				'stores',
				'storeCategoryOrders',
				'syncQueue'
			].sort()
		);
	});

	it('round-trips a row through the lists table', async () => {
		const db = getDb()!;
		await db.lists.put({
			id: 1,
			name: 'Groceries',
			color: '#3b82f6',
			icon: null,
			ownerId: 1,
	folderId: null,
	badgeExcluded: false,
			archived: false,
			itemCount: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			version: 1
		});

		const stored = await db.lists.get(1);
		expect(stored?.name).toBe('Groceries');
	});

	it('resetDbForTesting closes the database and clears the singleton', async () => {
		const first = getDb();
		await first!.open();
		await resetDbForTesting();
		const second = getDb();
		expect(second).not.toBe(first);
	});

	it('resetDbForTesting is a no-op when nothing was constructed yet', async () => {
		await expect(resetDbForTesting()).resolves.toBeUndefined();
	});
});

describe('isRowDirty', () => {
	afterEach(async () => {
		await resetDbForTesting();
	});

	it('is false when the row was never cached', async () => {
		await expect(isRowDirty('item', 1)).resolves.toBe(false);
	});

	it('is false when a store_category_order or list event fires — neither is ever queued client-side', async () => {
		await expect(isRowDirty('store_category_order', 1)).resolves.toBe(false);
		await expect(isRowDirty('list', 1)).resolves.toBe(false);
	});

	it.each([
		['item', 'items'],
		['category', 'categories'],
		['favorite_item', 'favoriteItems'],
		['store', 'stores']
	] as const)("reads the %s table's _dirty flag", async (entityType, table) => {
		const db = getDb()!;
		await (db[table] as { put: (row: unknown) => Promise<unknown> }).put({
			id: 1,
			version: 1,
			_dirty: true
		});

		await expect(isRowDirty(entityType, 1)).resolves.toBe(true);
	});
});
