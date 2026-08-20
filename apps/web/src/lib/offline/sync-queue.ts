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

/** All `pending` mutations, oldest first — the flush loop's replay order (PHASE5_PLAN.md §4). */
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
 * "failed" list (see PHASE14_PLAN.md). */
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

/** Backs the Settings sync-status page's queued-changes counts (PHASE14_PLAN.md). */
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
