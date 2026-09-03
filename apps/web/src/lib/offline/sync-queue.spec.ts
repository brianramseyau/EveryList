import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTesting } from './db';
import {
	dequeueMutation,
	enqueueConsolidated,
	enqueueMutation,
	failedMutations,
	findPendingMutation,
	pendingMutations,
	queueCounts,
	retryMutation,
	updateMutation
} from './sync-queue';

afterEach(async () => {
	await resetDbForTesting();
});

describe('enqueueMutation', () => {
	it('adds a pending mutation with attempts=0 and a createdAt timestamp', async () => {
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'create',
			targetId: -1,
			expectedVersion: null,
			payload: { name: 'Bananas' },
			url: '/api/v1/x'
		});

		expect(id).toBeTypeOf('number');
		const [mutation] = await pendingMutations();
		expect(mutation).toMatchObject({
			entityType: 'item',
			op: 'create',
			targetId: -1,
			expectedVersion: null,
			status: 'pending',
			attempts: 0
		});
		expect(mutation!.createdAt).toBeTypeOf('number');
	});
});

describe('enqueueConsolidated', () => {
	it('folds a second update into the first, keeping the original expectedVersion', async () => {
		const firstId = await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 5,
			payload: { name: 'Milk' },
			url: '/api/v1/x/5'
		});

		const result = await enqueueConsolidated({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 5,
			payload: { checked: true },
			url: '/api/v1/x/5'
		});

		expect(result).toEqual({ id: firstId, alreadyPending: true });
		const pending = await pendingMutations();
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({
			id: firstId,
			payload: { name: 'Milk', checked: true },
			expectedVersion: 5
		});
	});

	it('advances the expectedVersion of a delete queued after an update', async () => {
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 5,
			payload: { name: 'Milk' },
			url: '/api/v1/x/5'
		});

		await enqueueConsolidated({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 5,
			payload: {},
			url: '/api/v1/x/5'
		});

		const pending = await pendingMutations();
		expect(pending).toHaveLength(2);
		expect(pending[0]).toMatchObject({ op: 'update', expectedVersion: 5 });
		expect(pending[1]).toMatchObject({ op: 'delete', expectedVersion: 6 });
	});

	it('reports alreadyPending false for a row with no queued work', async () => {
		const result = await enqueueConsolidated({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 5,
			payload: { checked: true },
			url: '/api/v1/x/5'
		});

		expect(result?.alreadyPending).toBe(false);
		expect(await pendingMutations()).toHaveLength(1);
	});

	it('keeps updates to different rows as separate mutations', async () => {
		await enqueueConsolidated({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 5,
			payload: { checked: true },
			url: '/api/v1/x/5'
		});
		await enqueueConsolidated({
			entityType: 'item',
			op: 'update',
			targetId: 6,
			expectedVersion: 2,
			payload: { checked: true },
			url: '/api/v1/x/6'
		});

		expect(await pendingMutations()).toHaveLength(2);
	});

	it('leaves expectedVersion alone when the new mutation never had one', async () => {
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: null,
			payload: { name: 'Milk' },
			url: '/api/v1/x/5'
		});

		await enqueueConsolidated({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/x/5'
		});

		const pending = await pendingMutations();
		expect(pending).toHaveLength(2);
		expect(pending[1]).toMatchObject({ op: 'delete', expectedVersion: null });
	});
});

describe('findPendingMutation', () => {
	it('finds the pending mutation matching entityType, targetId, and op', async () => {
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 3,
			payload: {},
			url: '/api/v1/x/5'
		});

		const found = await findPendingMutation('item', 5, 'delete');
		expect(found).toMatchObject({ id, entityType: 'item', targetId: 5, op: 'delete' });
	});

	it('returns undefined when no mutation matches the row', async () => {
		await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 3,
			payload: {},
			url: '/api/v1/x/5'
		});

		expect(await findPendingMutation('item', 6, 'delete')).toBeUndefined();
	});

	it('returns undefined when the row has queued work of a different op', async () => {
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 3,
			payload: { checked: true },
			url: '/api/v1/x/5'
		});

		expect(await findPendingMutation('item', 5, 'delete')).toBeUndefined();
	});

	it('ignores a mutation that is no longer pending', async () => {
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 3,
			payload: {},
			url: '/api/v1/x/5'
		});
		await updateMutation(id!, { status: 'failed' });

		expect(await findPendingMutation('item', 5, 'delete')).toBeUndefined();
	});
});

describe('pendingMutations', () => {
	it('returns only pending mutations, oldest first', async () => {
		const firstId = await enqueueMutation({
			entityType: 'item',
			op: 'create',
			targetId: -1,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/x'
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'create',
			targetId: -2,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/x'
		});
		await updateMutation(firstId!, { status: 'conflict' });

		const pending = await pendingMutations();
		expect(pending).toHaveLength(1);
		expect(pending[0]!.targetId).toBe(-2);
	});
});

describe('failedMutations', () => {
	it('returns only failed mutations', async () => {
		const failedId = await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/x'
		});
		await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 6,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/x'
		});
		await updateMutation(failedId!, { status: 'failed' });

		const failed = await failedMutations();
		expect(failed).toHaveLength(1);
		expect(failed[0]!.targetId).toBe(5);
	});
});

describe('updateMutation', () => {
	it('patches fields on an existing queued mutation', async () => {
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 5,
			expectedVersion: 1,
			payload: { quantity: '2' },
			url: '/api/v1/x'
		});

		await updateMutation(id!, { status: 'failed', attempts: 3, lastError: 'network error' });

		const mutation = await getDb()!.syncQueue.get(id!);
		expect(mutation).toMatchObject({ status: 'failed', attempts: 3, lastError: 'network error' });
	});
});

describe('dequeueMutation', () => {
	it('removes a mutation from the queue', async () => {
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'delete',
			targetId: 5,
			expectedVersion: 2,
			payload: {},
			url: '/api/v1/x'
		});

		await dequeueMutation(id!);

		const pending = await pendingMutations();
		expect(pending).toHaveLength(0);
	});
});

describe('queueCounts', () => {
	it('tallies pending, failed, and conflict rows separately', async () => {
		await enqueueMutation({
			entityType: 'item',
			op: 'create',
			targetId: -1,
			expectedVersion: null,
			payload: {},
			url: '/api/v1/x'
		});
		const b = await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 1,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/x'
		});
		const c = await enqueueMutation({
			entityType: 'item',
			op: 'update',
			targetId: 2,
			expectedVersion: 1,
			payload: {},
			url: '/api/v1/x'
		});
		await updateMutation(b!, { status: 'failed' });
		await updateMutation(c!, { status: 'conflict' });

		expect(await queueCounts()).toEqual({ pending: 1, failed: 1, conflict: 1 });
	});
});

describe('retryMutation', () => {
	it('returns a failed mutation to the pending queue with a fresh attempt budget', async () => {
		const id = await enqueueMutation({
			entityType: 'item',
			op: 'create',
			targetId: -1,
			expectedVersion: null,
			payload: { name: 'Bananas' },
			url: '/api/v1/lists/1/items'
		});
		await updateMutation(id!, {
			status: 'failed',
			attempts: 3,
			lastError: 'This list allows at most 5 open items — check one off to add more.'
		});
		expect(await pendingMutations()).toHaveLength(0);

		await retryMutation(id!);

		const [retried] = await pendingMutations();
		expect(retried).toMatchObject({ id, status: 'pending', attempts: 0 });
		expect(retried!.lastError).toBeUndefined();
		expect(await failedMutations()).toHaveLength(0);
	});
});
