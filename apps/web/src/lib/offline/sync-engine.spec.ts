import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/api/client';
import { getDb, resetDbForTesting } from './db';
import { pendingMutations } from './sync-queue';
import { offlineCreate, offlineMutate, offlineReorder, offlineReset } from './sync-engine';

function setOnline(online: boolean) {
	Object.defineProperty(globalThis, 'navigator', {
		value: { onLine: online },
		configurable: true
	});
}

afterEach(async () => {
	setOnline(true);
	await resetDbForTesting();
});

describe('offlineCreate', () => {
	it('writes an optimistic row, flushes immediately when online, and dequeues on success', async () => {
		const db = getDb()!;
		const result = await offlineCreate<{ id: number; name: string }>({
			entityType: 'item',
			table: (database) => database.lists as never,
			payload: { name: 'Bananas' },
			url: '/api/v1/x',
			buildOptimisticRow: (tempId) => ({ id: tempId, name: 'Bananas' }) as never,
			request: async () => ({ id: 42, name: 'Bananas' })
		});

		expect(result).toEqual({ id: 42, name: 'Bananas' });
		expect(await pendingMutations()).toHaveLength(0);
		expect(await db.lists.toArray()).toEqual([]);
	});

	it('leaves the optimistic row and a queued mutation when offline', async () => {
		setOnline(false);
		const result = await offlineCreate<{ id: number; name: string }>({
			entityType: 'item',
			table: (database) => database.lists as never,
			payload: { name: 'Bananas' },
			url: '/api/v1/x',
			buildOptimisticRow: (tempId) => ({ id: tempId, name: 'Bananas' }) as never,
			request: async () => ({ id: 42, name: 'Bananas' })
		});

		expect(result).toMatchObject({ name: 'Bananas' });
		expect((result as { id: number }).id).toBeLessThan(0);
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('keeps the queued mutation on a network error while online', async () => {
		const result = await offlineCreate<{ id: number; name: string }>({
			entityType: 'item',
			table: (database) => database.lists as never,
			payload: { name: 'Bananas' },
			url: '/api/v1/x',
			buildOptimisticRow: (tempId) => ({ id: tempId, name: 'Bananas' }) as never,
			request: async () => {
				throw new TypeError('network error');
			}
		});

		expect(result).toMatchObject({ name: 'Bananas' });
		expect((result as { id: number }).id).toBeLessThan(0);
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('drops the optimistic row and rethrows on a real ApiError', async () => {
		const db = getDb()!;
		await expect(
			offlineCreate<{ id: number; name: string }>({
				entityType: 'item',
				table: (database) => database.lists as never,
				payload: { name: '' },
				url: '/api/v1/x',
				buildOptimisticRow: (tempId) => ({ id: tempId, name: '' }) as never,
				request: async () => {
					throw new ApiError(422, 'Name is required');
				}
			})
		).rejects.toThrow('Name is required');

		expect(await pendingMutations()).toHaveLength(0);
		expect(await db.lists.toArray()).toEqual([]);
	});

	it('degrades to a direct request when Dexie is unavailable', async () => {
		await resetDbForTesting();
		const originalIndexedDb = globalThis.indexedDB;
		// @ts-expect-error simulating no IndexedDB implementation
		delete globalThis.indexedDB;
		try {
			const result = await offlineCreate<{ id: number }>({
				entityType: 'item',
				table: (database) => database.lists as never,
				payload: {},
				url: '/api/v1/x',
				buildOptimisticRow: (tempId) => ({ id: tempId }) as never,
				request: async () => ({ id: 99 })
			});
			expect(result).toEqual({ id: 99 });
		} finally {
			globalThis.indexedDB = originalIndexedDb;
		}
	});
});

describe('offlineMutate', () => {
	it('applies optimistically and dequeues on a successful flush', async () => {
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
			deadline: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1
		});

		const result = await offlineMutate<{ version: number }>({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			payload: { checked: true },
			url: '/api/v1/x',
			applyOptimistically: async (database) => {
				const existing = await database.items.get(5);
				await database.items.put({ ...existing!, checked: true, _dirty: true });
				return existing!.version;
			},
			request: async () => ({ version: 2 })
		});

		expect(result).toEqual({ version: 2 });
		expect(await pendingMutations()).toHaveLength(0);
	});

	it('stays queued on a 409 conflict for the flush loop to reconcile', async () => {
		const result = await offlineMutate<{ version: number }>({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			payload: { checked: true },
			url: '/api/v1/x',
			applyOptimistically: async () => 1,
			request: async () => {
				throw new ApiError(409, 'Conflict');
			}
		});

		expect(result).toBeUndefined();
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('dequeues and rethrows on a non-conflict ApiError', async () => {
		await expect(
			offlineMutate<{ version: number }>({
				entityType: 'item',
				op: 'update',
				targetId: 5,
				payload: { checked: true },
				url: '/api/v1/x',
				applyOptimistically: async () => 1,
				request: async () => {
					throw new ApiError(403, 'Forbidden');
				}
			})
		).rejects.toThrow('Forbidden');

		expect(await pendingMutations()).toHaveLength(0);
	});

	it('stays queued when offline', async () => {
		setOnline(false);
		const result = await offlineMutate<{ version: number }>({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			payload: {},
			url: '/api/v1/x',
			applyOptimistically: async () => 1,
			request: async () => ({ version: 2 })
		});

		expect(result).toBeUndefined();
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('coalesces consecutive offline updates to the same row into one merged mutation', async () => {
		setOnline(false);
		await offlineMutate({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			payload: { name: 'Milk' },
			url: '/api/v1/x',
			applyOptimistically: async () => 5,
			request: async () => ({})
		});
		await offlineMutate({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			payload: { checked: true },
			url: '/api/v1/x',
			applyOptimistically: async () => 5,
			request: async () => ({})
		});

		const pending = await pendingMutations();
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({
			op: 'update',
			payload: { name: 'Milk', checked: true },
			expectedVersion: 5
		});
	});

	it('keeps a delete queued after an update as a separate mutation with an advanced version', async () => {
		setOnline(false);
		await offlineMutate({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			payload: { name: 'Milk' },
			url: '/api/v1/x',
			applyOptimistically: async () => 5,
			request: async () => ({})
		});
		await offlineMutate({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			payload: {},
			url: '/api/v1/x',
			applyOptimistically: async () => 5,
			request: async () => ({})
		});

		const pending = await pendingMutations();
		expect(pending).toHaveLength(2);
		expect(pending[0]).toMatchObject({ op: 'update', expectedVersion: 5 });
		expect(pending[1]).toMatchObject({ op: 'delete', expectedVersion: 6 });
	});

	it('defers to the flush loop instead of firing an immediate request when the row is already queued', async () => {
		const db = getDb()!;
		await db.syncQueue.add({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 5,
			payload: { name: 'Milk' },
			url: '/api/v1/x',
			status: 'pending',
			attempts: 0,
			createdAt: Date.now()
		});
		const request = vi.fn().mockResolvedValue({ version: 6 });

		const result = await offlineMutate<{ version: number }>({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			payload: { checked: true },
			url: '/api/v1/x',
			applyOptimistically: async () => 5,
			request
		});

		expect(result).toBeUndefined();
		expect(request).not.toHaveBeenCalled();
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('degrades to a direct request when Dexie is unavailable', async () => {
		await resetDbForTesting();
		const originalIndexedDb = globalThis.indexedDB;
		// @ts-expect-error simulating no IndexedDB implementation
		delete globalThis.indexedDB;
		try {
			const result = await offlineMutate<{ ok: true }>({
				entityType: 'item',
				op: 'delete',
				targetId: 5,
				payload: {},
				url: '/api/v1/x',
				applyOptimistically: async () => 1,
				request: async () => ({ ok: true })
			});
			expect(result).toEqual({ ok: true });
		} finally {
			globalThis.indexedDB = originalIndexedDb;
		}
	});
});

describe('offlineReorder', () => {
	it('applies optimistically, flushes immediately when online, and dequeues via onSuccess', async () => {
		const onSuccess = vi.fn().mockResolvedValue(undefined);
		const result = await offlineReorder<{ ids: number[] }>({
			entityType: 'category',
			scopeId: 1,
			payload: { order: [3, 1, 2] },
			url: '/api/v1/x',
			applyOptimistically: async () => ({ ids: [3, 1, 2] }),
			onSuccess,
			request: async () => ({ ids: [3, 1, 2] })
		});

		expect(result).toEqual({ ids: [3, 1, 2] });
		expect(onSuccess).toHaveBeenCalledWith(expect.anything(), { ids: [3, 1, 2] });
		expect(await pendingMutations()).toHaveLength(0);
	});

	it('leaves the optimistic result and a queued mutation when offline', async () => {
		setOnline(false);
		const onSuccess = vi.fn();
		const result = await offlineReorder<{ ids: number[] }>({
			entityType: 'category',
			scopeId: 1,
			payload: { order: [3, 1, 2] },
			url: '/api/v1/x',
			applyOptimistically: async () => ({ ids: [3, 1, 2] }),
			onSuccess,
			request: async () => ({ ids: [3, 1, 2] })
		});

		expect(result).toEqual({ ids: [3, 1, 2] });
		expect(onSuccess).not.toHaveBeenCalled();
		const pending = await pendingMutations();
		expect(pending).toMatchObject([{ op: 'reorder', targetId: 1, expectedVersion: null }]);
	});

	it('keeps the queued mutation on a network error while online', async () => {
		const result = await offlineReorder<{ ids: number[] }>({
			entityType: 'store_category_order',
			scopeId: 20,
			payload: { categories: [] },
			url: '/api/v1/x',
			applyOptimistically: async () => ({ ids: [] }),
			onSuccess: vi.fn(),
			request: async () => {
				throw new TypeError('network error');
			}
		});

		expect(result).toEqual({ ids: [] });
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('dequeues and rethrows on a real ApiError', async () => {
		await expect(
			offlineReorder<{ ids: number[] }>({
				entityType: 'category',
				scopeId: 1,
				payload: { order: [] },
				url: '/api/v1/x',
				applyOptimistically: async () => ({ ids: [] }),
				onSuccess: vi.fn(),
				request: async () => {
					throw new ApiError(422, 'Invalid order');
				}
			})
		).rejects.toThrow('Invalid order');

		expect(await pendingMutations()).toHaveLength(0);
	});

	it('degrades to a direct request when Dexie is unavailable', async () => {
		await resetDbForTesting();
		const originalIndexedDb = globalThis.indexedDB;
		// @ts-expect-error simulating no IndexedDB implementation
		delete globalThis.indexedDB;
		try {
			const result = await offlineReorder<{ ok: true }>({
				entityType: 'category',
				scopeId: 1,
				payload: {},
				url: '/api/v1/x',
				applyOptimistically: async () => ({ ok: true }),
				onSuccess: vi.fn(),
				request: async () => ({ ok: true })
			});
			expect(result).toEqual({ ok: true });
		} finally {
			globalThis.indexedDB = originalIndexedDb;
		}
	});
});

describe('offlineReset', () => {
	it('applies optimistically and dequeues via an immediate request when online', async () => {
		const applyOptimistically = vi.fn().mockResolvedValue(undefined);
		await offlineReset({
			entityType: 'store_category_order',
			scopeId: 20,
			url: '/api/v1/x',
			applyOptimistically,
			request: async () => {}
		});

		expect(applyOptimistically).toHaveBeenCalledWith(expect.anything());
		expect(await pendingMutations()).toHaveLength(0);
	});

	it('leaves a queued mutation when offline', async () => {
		setOnline(false);
		await offlineReset({
			entityType: 'store_category_order',
			scopeId: 20,
			url: '/api/v1/x',
			applyOptimistically: async () => {},
			request: async () => {}
		});

		const pending = await pendingMutations();
		expect(pending).toMatchObject([{ op: 'reset', targetId: 20, expectedVersion: null }]);
	});

	it('keeps the queued mutation on a network error while online', async () => {
		await offlineReset({
			entityType: 'store_category_order',
			scopeId: 20,
			url: '/api/v1/x',
			applyOptimistically: async () => {},
			request: async () => {
				throw new TypeError('network error');
			}
		});

		expect(await pendingMutations()).toHaveLength(1);
	});

	it('dequeues and rethrows on a real ApiError', async () => {
		await expect(
			offlineReset({
				entityType: 'store_category_order',
				scopeId: 20,
				url: '/api/v1/x',
				applyOptimistically: async () => {},
				request: async () => {
					throw new ApiError(403, 'Forbidden');
				}
			})
		).rejects.toThrow('Forbidden');

		expect(await pendingMutations()).toHaveLength(0);
	});

	it('degrades to a direct request when Dexie is unavailable', async () => {
		await resetDbForTesting();
		const originalIndexedDb = globalThis.indexedDB;
		// @ts-expect-error simulating no IndexedDB implementation
		delete globalThis.indexedDB;
		const request = vi.fn().mockResolvedValue(undefined);
		try {
			await offlineReset({
				entityType: 'store_category_order',
				scopeId: 20,
				url: '/api/v1/x',
				applyOptimistically: async () => {},
				request
			});
			expect(request).toHaveBeenCalled();
		} finally {
			globalThis.indexedDB = originalIndexedDb;
		}
	});
});
