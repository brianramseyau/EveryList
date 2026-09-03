import { describe, expect, it } from 'vitest';
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

// Deliberately does NOT import 'fake-indexeddb/auto' — exercises every
// function's no-op fallback when Dexie isn't available (SSR/prerender),
// mirroring db-no-indexeddb.spec.ts.
describe('without an IndexedDB implementation', () => {
	it('enqueueMutation returns undefined', async () => {
		await expect(
			enqueueMutation({
				entityType: 'item',
				op: 'create',
				targetId: -1,
				expectedVersion: null,
				payload: {},
				url: '/api/v1/x'
			})
		).resolves.toBeUndefined();
	});

	it('enqueueConsolidated returns undefined', async () => {
		await expect(
			enqueueConsolidated({
				entityType: 'item',
				op: 'update',
				targetId: 5,
				expectedVersion: 1,
				payload: {},
				url: '/api/v1/x'
			})
		).resolves.toBeUndefined();
	});

	it('findPendingMutation returns undefined', async () => {
		await expect(findPendingMutation('item', 5, 'delete')).resolves.toBeUndefined();
	});

	it('pendingMutations returns an empty array', async () => {
		await expect(pendingMutations()).resolves.toEqual([]);
	});

	it('failedMutations returns an empty array', async () => {
		await expect(failedMutations()).resolves.toEqual([]);
	});

	it('updateMutation resolves without throwing', async () => {
		await expect(updateMutation(1, { status: 'failed' })).resolves.toBeUndefined();
	});

	it('dequeueMutation resolves without throwing', async () => {
		await expect(dequeueMutation(1)).resolves.toBeUndefined();
	});

	it('queueCounts returns all zeros', async () => {
		await expect(queueCounts()).resolves.toEqual({ pending: 0, failed: 0, conflict: 0 });
	});

	it('retryMutation resolves without a database', async () => {
		await expect(retryMutation(1)).resolves.toBeUndefined();
	});
});
