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
	const db = getDb();
	if (!db) return [];

	return db.syncQueue.where('status').equals('pending').sortBy('createdAt');
}

export async function updateMutation(id: number, changes: Partial<QueuedMutation>): Promise<void> {
	const db = getDb();
	if (!db) return;

	await db.syncQueue.update(id, changes);
}

export async function dequeueMutation(id: number): Promise<void> {
	const db = getDb();
	if (!db) return;

	await db.syncQueue.delete(id);
}

export interface QueueCounts {
	pending: number;
	failed: number;
	conflict: number;
}

/** Backs the `SyncStatusBanner` — a non-zero total means the banner should be visible. */
export async function queueCounts(): Promise<QueueCounts> {
	const db = getDb();
	if (!db) return { pending: 0, failed: 0, conflict: 0 };

	const [pending, failed, conflict] = await Promise.all([
		db.syncQueue.where('status').equals('pending').count(),
		db.syncQueue.where('status').equals('failed').count(),
		db.syncQueue.where('status').equals('conflict').count()
	]);

	return { pending, failed, conflict };
}
