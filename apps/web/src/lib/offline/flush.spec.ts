import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/client')>();
	return { ...actual, apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});

const { apiPost, apiPatch, apiDelete, ApiError } = await import('$lib/api/client');
const { getDb, resetDbForTesting } = await import('./db');
const { enqueueMutation, pendingMutations } = await import('./sync-queue');
const { flushQueue, onConflict, onFlushOutcome } = await import('./flush');

afterEach(async () => {
	vi.resetAllMocks();
	// Also exercises the no-op unsubscribe this "clear everything" call returns.
	onConflict(null)();
	onFlushOutcome(null)();
	await resetDbForTesting();
});

describe('flushQueue', () => {
	it('replays a queued create, deletes the optimistic temp row, and dequeues on success', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42 });
		const db = getDb()!;
		await db.items.put({
			id: -1,
			listId: 1,
			name: 'Bananas',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: '-1',
			_dirty: true
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'create',
			targetId: -1,
			expectedVersion: null,
			payload: { name: 'Bananas' },
			url: '/api/v1/lists/1/items'
		});

		await flushQueue();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items', { name: 'Bananas' });
		expect(await pendingMutations()).toHaveLength(0);
		expect(await db.items.get(-1)).toBeUndefined();
	});

	it('replays a queued restore via POST and adopts the server response, with no expectedVersion guard', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 5, deletedAt: null, version: 2 });
		const db = getDb()!;
		await db.items.put({
			id: 5,
			listId: 1,
			name: 'Bananas',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: '2026-08-20T00:00:00.000Z',
			version: 1,
			_dirty: true
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'restore',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5/restore'
		});

		await flushQueue();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/items/5/restore', {});
		expect(await pendingMutations()).toHaveLength(0);
		const cached = await db.items.get(5);
		expect(cached?.deletedAt).toBeNull();
		expect(cached?.version).toBe(2);
		expect(cached?._dirty).toBe(false);
	});

	it('sends expectedVersion in the body when replaying a queued update', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 5, version: 2 });
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/5', {
			checked: true,
			expectedVersion: 1
		});
	});

	it('adopts the server response into the cache after a queued update replays successfully, so the next edit is not computed against a stale version', async () => {
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
			checked: true,
			checkedAt: '2026-08-17T00:00:00.000Z',
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_dirty: true
		});
		vi.mocked(apiPatch).mockResolvedValue({
			id: 5,
			checked: true,
			checkedAt: '2026-08-17T00:00:00.000Z',
			version: 2
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		// Without this, the row's `version` stays at 1 locally while the server is at 2 — the
		// very next edit to this item would then send the stale `expectedVersion` and 409
		// against the sync that had just succeeded.
		const cached = await db.items.get(5);
		expect(cached?.version).toBe(2);
		expect(cached?._dirty).toBe(false);
	});

	it('does not touch the cache when a queued restore succeeds without a response body', async () => {
		vi.mocked(apiPost).mockResolvedValue(undefined);
		await enqueueMutation({
			entityType: 'item',
			op: 'restore',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5/restore'
		});

		await flushQueue();

		expect(await pendingMutations()).toHaveLength(0);
	});

	it('does not touch the cache when a queued update succeeds without a response body', async () => {
		vi.mocked(apiPatch).mockResolvedValue(undefined);
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		expect(await pendingMutations()).toHaveLength(0);
	});

	it('omits expectedVersion from the body when a queued update never had one', async () => {
		vi.mocked(apiPatch).mockResolvedValue({ id: 5 });
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: null,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/items/5', { checked: true });
	});

	it('appends expectedVersion as a query param when replaying a queued delete', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 3,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/5?expectedVersion=3');
	});

	it('leaves the URL bare when a queued delete never had an expectedVersion', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/lists/1/items/5');
	});

	it('does not run two overlapping drains — a call while one is already in flight no-ops', async () => {
		// Resolved once `replay()` actually calls `apiPatch`, so the test can wait for that instead
		// of racing Dexie's own internal async scheduling — and `resolveApiPatch` is always invoked
		// before any assertion below, so a failing expectation can never leave `firstFlush` hanging
		// mid-request into the next test (which would leave the module's `flushing` guard stuck).
		let resolveApiPatch: ((value: { id: number; version: number }) => void) | undefined;
		const apiPatchCalled = new Promise<void>((resolveCalled) => {
			vi.mocked(apiPatch).mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveApiPatch = resolve;
						resolveCalled();
					})
			);
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		});

		const firstFlush = flushQueue();
		// Mobile reconnects routinely fire more than one flush trigger in quick succession (the
		// `online` listener, a backoff retry, "Retry now") — this second call lands while the
		// first is still awaiting its request and must no-op rather than replaying the same
		// still-pending mutation a second time (see flush.ts's `flushing` guard).
		const secondFlush = flushQueue();
		await secondFlush;
		await apiPatchCalled;

		resolveApiPatch!({ id: 5, version: 2 });
		await firstFlush;

		expect(apiPatch).toHaveBeenCalledTimes(1);
		expect(await pendingMutations()).toHaveLength(0);
	});

	it('stops draining on a network error, leaving later mutations queued', async () => {
		vi.mocked(apiPatch)
			.mockRejectedValueOnce(new TypeError('network down'))
			.mockResolvedValueOnce({ id: 6 });
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 6,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/6'
		});

		await flushQueue();

		expect(apiPatch).toHaveBeenCalledTimes(1);
		expect(await pendingMutations()).toHaveLength(2);
	});

	it('records a reason and notifies flush-outcome listeners on a network error', async () => {
		vi.mocked(apiPatch).mockRejectedValue(new TypeError('Failed to fetch'));
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});
		const listener = vi.fn();
		onFlushOutcome(listener);

		await flushQueue();

		expect(listener).toHaveBeenCalledWith({ ok: false });
		const [mutation] = await pendingMutations();
		expect(mutation).toMatchObject({ status: 'pending', lastError: 'Failed to fetch' });
	});

	it('falls back to a generic reason when a network error is not an Error instance', async () => {
		vi.mocked(apiPatch).mockRejectedValue('offline');
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		const [mutation] = await pendingMutations();
		expect(mutation).toMatchObject({ status: 'pending', lastError: 'Network error' });
	});

	it('stops notifying a listener once its onFlushOutcome subscription is unsubscribed', async () => {
		vi.mocked(apiPatch).mockRejectedValue(new TypeError('network down'));
		const listener = vi.fn();
		const unsubscribe = onFlushOutcome(listener);

		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});
		await flushQueue();
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();

		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 6,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/6'
		});
		await flushQueue();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('increments attempts and records the error on a non-conflict ApiError, without marking failed below the cap', async () => {
		vi.mocked(apiPatch).mockRejectedValue(new ApiError(403, 'Forbidden'));
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		const [mutation] = await pendingMutations();
		expect(mutation).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Forbidden' });
	});

	it('marks a mutation failed once it reaches the max attempt count', async () => {
		vi.mocked(apiPatch).mockRejectedValue(new ApiError(403, 'Forbidden'));
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});
		await getDb()!.syncQueue.update(id!, { attempts: 7 });

		await flushQueue();

		const mutation = await getDb()!.syncQueue.get(id!);
		expect(mutation).toMatchObject({ status: 'failed', attempts: 8 });
	});

	it('on a 409, merges the server copy into the cache, re-enqueues the still-differing offline edit against the new version, and notifies the conflict listener', async () => {
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
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_dirty: true
		});
		vi.mocked(apiPatch).mockRejectedValue(
			new ApiError(409, 'Conflict', {
				data: { id: 5, name: 'Milk', checked: false, version: 2 },
				conflict: true
			})
		);
		const listener = vi.fn();
		onConflict(listener);

		const mutation = {
			entityType: 'item' as const,
			op: 'update' as const,
			targetId: 5,
			expectedVersion: 1,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		};
		await enqueueMutation(mutation);

		await flushQueue();

		// The winning edit (a newer version, e.g. a note change from another device) didn't touch
		// `checked` — the offline check-off is reapplied over the fresh copy, not discarded by it.
		const cached = await db.items.get(5);
		expect(cached?.checked).toBe(true);
		expect(cached?.version).toBe(2);
		expect(cached?._dirty).toBe(true);
		expect(listener).toHaveBeenCalledWith(expect.objectContaining({ targetId: 5 }));

		const [requeued] = await pendingMutations();
		expect(requeued).toMatchObject({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 2,
			payload: { checked: true }
		});
	});

	it('stops notifying a listener once its onConflict subscription is unsubscribed', async () => {
		vi.mocked(apiDelete).mockRejectedValue(new ApiError(409, 'Conflict'));
		const listener = vi.fn();
		const unsubscribe = onConflict(listener);

		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});
		await flushQueue();
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();

		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 6,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/6'
		});
		await flushQueue();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('on a 409 where the winning edit already matches the offline change, adopts the server copy without re-queuing', async () => {
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
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_dirty: true
		});
		vi.mocked(apiPatch).mockRejectedValue(
			new ApiError(409, 'Conflict', {
				data: { id: 5, name: 'Milk', checked: true, version: 2 },
				conflict: true
			})
		);
		const listener = vi.fn();
		onConflict(listener);

		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: { checked: true },
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		const cached = await db.items.get(5);
		expect(cached?.checked).toBe(true);
		expect(cached?.version).toBe(2);
		expect(cached?._dirty).toBe(false);
		expect(listener).toHaveBeenCalledWith(expect.objectContaining({ targetId: 5 }));
		expect(await pendingMutations()).toHaveLength(0);
	});

	it.each([
		['category', 'categories', { id: 9, name: 'Produce (renamed)', version: 2 }],
		['favorite_item', 'favoriteItems', { id: 9, name: 'Bananas (renamed)', version: 2 }],
		['store', 'stores', { id: 9, name: 'Costco (renamed)', version: 2 }]
	] as const)(
		'reconciles a 409 for a queued %s mutation via its cache table',
		async (entityType, table, serverRow) => {
			const db = getDb()!;
			await (db[table] as { put: (row: unknown) => Promise<unknown> }).put({ id: 9, version: 1 });
			vi.mocked(apiPatch).mockRejectedValue(new ApiError(409, 'Conflict', { data: serverRow }));

			await enqueueMutation({
				entityType,
				op: 'update',
				targetId: 9,
				expectedVersion: 1,
				payload: {},
				url: '/api/v1/x/9'
			});

			await flushQueue();

			const cached = await (db[table] as { get: (id: number) => Promise<{ version: number }> }).get(
				9
			);
			expect(cached?.version).toBe(2);
		}
	);

	it('on a 409 for a queued delete with a response body, adopts the server copy without attempting to re-diff/re-enqueue', async () => {
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
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 1,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: '2026-08-16T00:00:00.000Z',
			version: 1,
			_dirty: true
		});
		vi.mocked(apiDelete).mockRejectedValue(
			new ApiError(409, 'Conflict', { data: { id: 5, deletedAt: null, version: 2 } })
		);
		const listener = vi.fn();
		onConflict(listener);
		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		const cached = await db.items.get(5);
		expect(cached?.deletedAt).toBeNull();
		expect(cached?.version).toBe(2);
		expect(cached?._dirty).toBe(false);
		expect(listener).toHaveBeenCalledWith(expect.objectContaining({ targetId: 5 }));
		expect(await pendingMutations()).toHaveLength(0);
	});

	it('on a 409 without a response body, still notifies the listener and dequeues without touching the cache', async () => {
		vi.mocked(apiDelete).mockRejectedValue(new ApiError(409, 'Conflict'));
		const listener = vi.fn();
		onConflict(listener);
		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/lists/1/items/5'
		});

		await flushQueue();

		expect(listener).toHaveBeenCalled();
		expect(await pendingMutations()).toHaveLength(0);
	});

	it('replays a queued attach the same way as a create — POSTs and deletes the placeholder', async () => {
		vi.mocked(apiPost).mockResolvedValue({ id: 42 });
		const db = getDb()!;
		await db.items.put({
			id: -1,
			listId: 1,
			name: 'Bananas',
			quantity: null,
			notes: null,
			categoryId: null,
			storeId: null,
			price: null,
			checked: false,
			checkedAt: null,
			sortOrder: 0,
			createdBy: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: '-1',
			_dirty: true
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'attach',
			targetId: -1,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/lists/1/favorites/5/add-to-list'
		});

		await flushQueue();

		expect(apiPost).toHaveBeenCalledWith('/api/v1/lists/1/favorites/5/add-to-list', {});
		expect(await pendingMutations()).toHaveLength(0);
		expect(await db.items.get(-1)).toBeUndefined();
	});

	it('replays a queued category reorder, adopting the server order and clearing dirty', async () => {
		vi.mocked(apiPatch).mockResolvedValue([
			{ id: 1, name: 'Produce', sortOrder: 0, version: 2 },
			{ id: 2, name: 'Dairy', sortOrder: 1, version: 2 }
		]);
		const db = getDb()!;
		await db.categories.put({
			id: 1,
			name: 'Produce',
			icon: 'fruit',
			sortOrder: 1,
			listId: 1,
			isDefault: false,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_dirty: true
		});
		await enqueueMutation({
			entityType: 'category',
			op: 'reorder',
			targetId: 1,
			expectedVersion: null,
			payload: { order: [1, 2] },
			url: '/api/v1/lists/1/categories/reorder'
		});

		await flushQueue();

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/lists/1/categories/reorder', { order: [1, 2] });
		expect(await pendingMutations()).toHaveLength(0);
		const cached = await db.categories.get(1);
		expect(cached?.sortOrder).toBe(0);
		expect(cached?._dirty).toBe(false);
	});

	it('replays a queued store-category-order reorder, adopting the server order and clearing dirty', async () => {
		vi.mocked(apiPatch).mockResolvedValue([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 2 }
		]);
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
		await enqueueMutation({
			entityType: 'store_category_order',
			op: 'reorder',
			targetId: 20,
			expectedVersion: null,
			payload: { categories: [{ categoryId: 5, sortOrder: 0 }] },
			url: '/api/v1/stores/20/categories'
		});

		await flushQueue();

		expect(apiPatch).toHaveBeenCalledWith('/api/v1/stores/20/categories', {
			categories: [{ categoryId: 5, sortOrder: 0 }]
		});
		expect(await pendingMutations()).toHaveLength(0);
		const cached = await db.storeCategoryOrders.get([20, 5]);
		expect(cached?.sortOrder).toBe(0);
		expect(cached?._dirty).toBe(false);
	});

	it('replays a queued store-category-order reset, clearing every cached row for that store', async () => {
		vi.mocked(apiDelete).mockResolvedValue(undefined);
		const db = getDb()!;
		await db.storeCategoryOrders.bulkPut([
			{ id: 1, storeId: 20, categoryId: 5, sortOrder: 0, deletedAt: null, version: 1 },
			{ id: 2, storeId: 20, categoryId: 6, sortOrder: 1, deletedAt: null, version: 1 },
			{ id: 3, storeId: 21, categoryId: 5, sortOrder: 0, deletedAt: null, version: 1 }
		]);
		await enqueueMutation({
			entityType: 'store_category_order',
			op: 'reset',
			targetId: 20,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/stores/20/categories'
		});

		await flushQueue();

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/stores/20/categories');
		expect(await pendingMutations()).toHaveLength(0);
		expect(await db.storeCategoryOrders.where('storeId').equals(20).count()).toBe(0);
		expect(await db.storeCategoryOrders.get([21, 5])).toBeDefined();
	});
});
