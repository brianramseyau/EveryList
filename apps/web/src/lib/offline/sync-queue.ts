import { getDb, type QueuedMutation, type SyncEntityType } from './db';

export type { QueuedMutation, SyncEntityType };

/** Enqueues a mutation as `pending`; no-ops (returns `undefined`) when Dexie isn't available. */
export async function enqueueMutation(
	mutation: Omit<QueuedMutation, 'id' | 'status' | 'attempts' | 'createdAt'>
): Promise<number | undefined> {
	const db = getDb();
	if (!db) return undefined;

	return db.syncQueue.add({
		...mutation,
		status: 'pending',
		attempts: 0,
		createdAt: Date.now()
	});
}

export interface ConsolidatedEnqueueResult {
	id: number;
	/** True when the row already had queued work, so the caller should leave the
	 * (now-merged) mutation for the flush loop rather than firing its own
	 * immediate request against a partial state (see sync-engine.ts). */
	alreadyPending: boolean;
}

/** Enqueues a user-initiated mutation, coalescing it with any already-pending
 * mutation for the same row so the queue holds the latest *state* rather than a
 * history of actions. Multiple updates to one row fold into a single mutation
 * carrying the merged field values and the row's *original* `expectedVersion`
 * (the version it had when it first went dirty) — the correct baseline for
 * detecting a genuine cross-device conflict. A distinct operation queued behind
 * earlier edits (e.g. a delete after an update, which soft-deletes so the prior
 * state change still matters) stays a separate mutation, but its
 * `expectedVersion` is advanced past the earlier mutations' version bumps so it
 * doesn't self-conflict against them. */
export async function enqueueConsolidated(
	mutation: Omit<QueuedMutation, 'id' | 'status' | 'attempts' | 'createdAt'>
): Promise<ConsolidatedEnqueueResult | undefined> {
	const db = getDb();
	if (!db) return undefined;

	const pending = await db.syncQueue
		.where('status')
		.equals('pending')
		.filter((row) => row.entityType === mutation.entityType && row.targetId === mutation.targetId)
		.sortBy('createdAt');

	const pendingUpdate = pending.find((row) => row.op === 'update');
	if (mutation.op === 'update' && pendingUpdate) {
		await db.syncQueue.update(pendingUpdate.id!, {
			payload: { ...pendingUpdate.payload, ...mutation.payload }
		});
		return { id: pendingUpdate.id!, alreadyPending: true };
	}

	const advanced = { ...mutation };
	if (advanced.expectedVersion !== null && pending.length > 0) {
		advanced.expectedVersion = advanced.expectedVersion + pending.length;
	}

	const id = await db.syncQueue.add({
		...advanced,
		status: 'pending',
		attempts: 0,
		createdAt: Date.now()
	});
	return { id, alreadyPending: pending.length > 0 };
}

/** All `pending` mutations, oldest first — the flush loop's replay order (PLAN_05_PHASE_OFFLINE_PWA.md §4). */
export async function pendingMutations(): Promise<QueuedMutation[]> {
	// Provably covered in isolation — other spec files' `vi.mock('./db', …)`/
	// `vi.mock('./sync-queue', …)` corrupts this statement's V8 attribution
	// once merged into the full suite, the same coverage-collection artifact
	// documented on $lib/api/selected-store.ts and $lib/api/token.ts.
	/* v8 ignore next */
	const db = getDb();
	if (!db) return [];

	return db.syncQueue.where('status').equals('pending').sortBy('createdAt');
}

/** Mutations the server rejected past `MAX_ATTEMPTS` — the sync-status page's
 * "failed" list (see PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md). */
export async function failedMutations(): Promise<QueuedMutation[]> {
	/* v8 ignore next */
	const db = getDb();
	if (!db) return [];

	return db.syncQueue.where('status').equals('failed').sortBy('createdAt');
}

export async function updateMutation(id: number, changes: Partial<QueuedMutation>): Promise<void> {
	/* v8 ignore next */
	const db = getDb();
	if (!db) return;

	await db.syncQueue.update(id, changes);
}

export async function dequeueMutation(id: number): Promise<void> {
	/* v8 ignore next */
	const db = getDb();
	if (!db) return;

	await db.syncQueue.delete(id);
}

export interface QueueCounts {
	pending: number;
	failed: number;
	conflict: number;
}

/** Backs the Settings sync-status page's queued-changes counts (PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md). */
export async function queueCounts(): Promise<QueueCounts> {
	/* v8 ignore next */
	const db = getDb();
	if (!db) return { pending: 0, failed: 0, conflict: 0 };

	const [pending, failed, conflict] = await Promise.all([
		db.syncQueue.where('status').equals('pending').count(),
		db.syncQueue.where('status').equals('failed').count(),
		db.syncQueue.where('status').equals('conflict').count()
	]);

	return { pending, failed, conflict };
}
