import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A pathological (never happens in practice) case where enqueueMutation
// resolves `undefined` even though Dexie is available — exercises the
// `queueId !== undefined` guard around dequeueMutation in both offlineCreate
// and offlineMutate, which the normal-path specs in sync-engine.spec.ts
// never hit (enqueueMutation always returns a real id there).
vi.mock('./sync-queue', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./sync-queue')>();
	return {
		...actual,
		enqueueMutation: vi.fn().mockResolvedValue(undefined),
		dequeueMutation: vi.fn()
	};
});

const { resetDbForTesting } = await import('./db');
const { dequeueMutation } = await import('./sync-queue');
const { offlineCreate, offlineMutate } = await import('./sync-engine');

afterEach(async () => {
	vi.clearAllMocks();
	await resetDbForTesting();
});

describe('offlineCreate with an unresolvable queue id', () => {
	it('still resolves normally on success without calling dequeueMutation', async () => {
		const result = await offlineCreate<{ id: number }>({
			entityType: 'item',
			table: (db) => db.lists as never,
			payload: {},
			url: '/api/v1/x',
			buildOptimisticRow: (tempId) => ({ id: tempId }) as never,
			request: async () => ({ id: 1 })
		});

		expect(result).toEqual({ id: 1 });
		expect(dequeueMutation).not.toHaveBeenCalled();
	});

	it('still resolves normally after a real ApiError without calling dequeueMutation', async () => {
		const { ApiError } = await import('$lib/api/client');
		await expect(
			offlineCreate<{ id: number }>({
				entityType: 'item',
				table: (db) => db.lists as never,
				payload: {},
				url: '/api/v1/x',
				buildOptimisticRow: (tempId) => ({ id: tempId }) as never,
				request: async () => {
					throw new ApiError(422, 'bad');
				}
			})
		).rejects.toThrow('bad');

		expect(dequeueMutation).not.toHaveBeenCalled();
	});
});

describe('offlineMutate with an unresolvable queue id', () => {
	it('still resolves normally on success without calling dequeueMutation', async () => {
		const result = await offlineMutate<{ ok: true }>({
			entityType: 'item',
			op: 'update',
			targetId: 1,
			payload: {},
			url: '/api/v1/x',
			applyOptimistically: async () => 1,
			request: async () => ({ ok: true })
		});

		expect(result).toEqual({ ok: true });
		expect(dequeueMutation).not.toHaveBeenCalled();
	});

	it('still resolves normally after a non-conflict ApiError without calling dequeueMutation', async () => {
		const { ApiError } = await import('$lib/api/client');
		await expect(
			offlineMutate<{ ok: true }>({
				entityType: 'item',
				op: 'update',
				targetId: 1,
				payload: {},
				url: '/api/v1/x',
				applyOptimistically: async () => 1,
				request: async () => {
					throw new ApiError(403, 'forbidden');
				}
			})
		).rejects.toThrow('forbidden');

		expect(dequeueMutation).not.toHaveBeenCalled();
	});
});
