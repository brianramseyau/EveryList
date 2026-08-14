import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTesting } from './db';
import {
	dequeueMutation,
	enqueueMutation,
	pendingMutations,
	queueCounts,
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
