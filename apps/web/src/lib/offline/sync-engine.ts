import type { Table } from 'dexie';
import { ApiError } from '$lib/api/client';
import { getDb, type EveryListDB, type SyncEntityType } from './db';
import { dequeueMutation, enqueueConsolidated, enqueueMutation } from './sync-queue';
import { markSelfMutation } from './self-mutations';

let tempIdCounter = 0;

/** A negative, per-tab-unique placeholder id for a row created while offline,
 * swapped for the server's real id once the create mutation is acked. */
export function nextTempId(): number {
	tempIdCounter -= 1;
	return tempIdCounter;
}

/** Node's built-in `navigator` global (present since Node 21) has no
 * `onLine` property at all, so only an explicit `false` counts as offline —
 * anything else (missing `navigator`, or `onLine` simply undefined) is
 * treated as online. */
function isOnline(): boolean {
	return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export interface OfflineCreateOptions<T> {
	entityType: SyncEntityType;
	/** `'attach'` for a join/create-by-reference operation (attaching an existing store, adding a
	 * favorite to a list) — same optimistic-temp-id-then-replace mechanics as a plain `'create'`,
	 * just a distinct queue label so the sync-status page describes it accurately. Defaults to
	 * `'create'`. */
	op?: 'create' | 'attach';
	/** Only called once Dexie is confirmed available. */
	table: (db: EveryListDB) => Table<T, number>;
	/** Builds the optimistic row under the given temp (negative) id. */
	buildOptimisticRow: (tempId: number) => T;
	payload: Record<string, unknown>;
	/** The request path to replay from the flush loop if this create doesn't resolve immediately. */
	url: string;
	request: () => Promise<T>;
}

/**
 * Write path for creates (PHASE5_PLAN.md §4): writes an optimistic row to
 * Dexie under a temp id and queues the mutation, then — when online —
 * attempts the real request immediately, replacing the temp row with the
 * server's response on success. When Dexie isn't available at all (SSR, or
 * a plain unit test with no fake-indexeddb), this degrades to today's
 * direct online-only behavior.
 */
export async function offlineCreate<T>(opts: OfflineCreateOptions<T>): Promise<T> {
	const db = getDb();
	if (!db) return opts.request();

	const table = opts.table(db);
	const tempId = nextTempId();
	const optimisticRow = opts.buildOptimisticRow(tempId);
	await table.put(optimisticRow);

	const queueId = await enqueueMutation({
		entityType: opts.entityType,
		op: opts.op ?? 'create',
		targetId: tempId,
		expectedVersion: null,
		payload: opts.payload,
		url: opts.url
	});

	if (!isOnline()) return optimisticRow;

	try {
		const result = await opts.request();
		await table.delete(tempId);
		if (queueId !== undefined) await dequeueMutation(queueId);
		return result;
	} catch (err) {
		if (err instanceof ApiError) {
			// A real server rejection (validation, auth, ...) can't be resolved by
			// retrying the same payload later — surface it and drop the queued row.
			await table.delete(tempId);
			if (queueId !== undefined) await dequeueMutation(queueId);
			throw err;
		}
		// Network error — stays queued for the flush loop; caller sees the optimistic row.
		return optimisticRow;
	}
}

export interface OfflineMutateOptions<T> {
	entityType: SyncEntityType;
	op: 'update' | 'delete' | 'restore';
	targetId: number;
	/** Reads the row, applies the change to Dexie immediately (merge for
	 * update, `deletedAt` for delete), and returns the row's last-known
	 * version to send as `expectedVersion`. Only called once Dexie is
	 * confirmed available, so it's safe to assume the row exists. */
	applyOptimistically: (db: EveryListDB) => Promise<number>;
	/** Called after a successful flush so the caller can reconcile the cached
	 * row with the server's authoritative response — e.g. adopt its bumped
	 * `version` and clear the dirty flag, so the next optimistic edit's
	 * `expectedVersion` isn't stale. */
	onSuccess?: (db: EveryListDB, result: T | void) => Promise<void>;
	payload: Record<string, unknown>;
	/** The request path to replay from the flush loop if this mutation doesn't resolve
	 * immediately — for a delete, `expectedVersion` is appended as a query param at replay time,
	 * matching how the backend reads it off the DELETE request (see version_conflict.ts). */
	url: string;
	request: () => Promise<T | void>;
}

/**
 * Write path for updates/deletes: applies the change to Dexie immediately,
 * queues it with the row's last-known version as `expectedVersion`, then —
 * when online — attempts the real request immediately. Degrades to direct
 * online-only behavior when Dexie isn't available, same as `offlineCreate`.
 */
export async function offlineMutate<T>(opts: OfflineMutateOptions<T>): Promise<T | void> {
	const db = getDb();
	if (!db) return opts.request();

	// Remember we did this so the realtime broadcast of our own edit (arriving
	// just after the flush clears `_dirty`) doesn't trigger a redundant reload.
	markSelfMutation(opts.entityType, opts.targetId);

	const expectedVersion = await opts.applyOptimistically(db);

	const enqueued = await enqueueConsolidated({
		entityType: opts.entityType,
		op: opts.op,
		targetId: opts.targetId,
		expectedVersion,
		payload: opts.payload,
		url: opts.url
	});

	// Offline, or the row already had queued work (this edit was coalesced into /
	// queued behind it) — leave it for the flush loop, which replays the *merged*
	// state. Firing an immediate request here would send only this edit's fields
	// and dequeue the merged mutation, dropping the earlier queued changes.
	if (!isOnline() || !enqueued || enqueued.alreadyPending) return undefined;

	try {
		const result = await opts.request();
		if (opts.onSuccess) await opts.onSuccess(db, result);
		await dequeueMutation(enqueued.id);
		return result;
	} catch (err) {
		if (err instanceof ApiError && err.status !== 409) {
			// A non-conflict server rejection can't be resolved by retrying later.
			await dequeueMutation(enqueued.id);
			throw err;
		}
		// Network error, or a 409 the flush loop will reconcile — stays queued.
		return undefined;
	}
}

export interface OfflineReorderOptions<T> {
	entityType: SyncEntityType;
	/** The bulk operation's scope id — a list id for a category reorder, a store id for a store's
	 * category order — not a single row's id (there isn't one for a bulk operation). Matches the
	 * `entityId` the corresponding realtime broadcast uses (categories_controller.ts's `reorder`,
	 * stores_controller.ts's `reorderCategories`), so `markSelfMutation` correctly suppresses the
	 * echo of this client's own reorder. */
	scopeId: number;
	/** Applies the new order to every affected local Dexie row immediately (optimistic) and marks
	 * each dirty — so a realtime event for any of those rows racing the queued flush doesn't
	 * clobber the optimistic order first (see `isRowDirty`, db.ts). Returns the affected rows,
	 * mirroring the server's response shape, so the caller can update its own UI state the same
	 * way it does today for the online path. Only called once Dexie is confirmed available. */
	applyOptimistically: (db: EveryListDB) => Promise<T>;
	/** Called after a successful immediate (online) request to clear the dirty flags set by
	 * `applyOptimistically`, adopting the server's authoritative rows — mirrors `offlineMutate`'s
	 * `onSuccess`. The queued-and-later-flushed path does the equivalent via
	 * `offline/flush.ts`'s `replayReorder`. */
	onSuccess: (db: EveryListDB, result: T) => Promise<void>;
	/** The full desired-order payload to replay from the flush loop if this doesn't resolve
	 * immediately (PHASE13_PLAN.md §5). */
	payload: Record<string, unknown>;
	url: string;
	request: () => Promise<T>;
}

/**
 * Write path for bulk reorders (PHASE13_PLAN.md §5: category reorder, store aisle order).
 * Unlike `offlineMutate`, there's no single row's version to guard: the reorder endpoints bump
 * every touched row's version unconditionally, with no `expectedVersion` check (see
 * categories_controller.ts's `reorder` / stores_controller.ts's `reorderCategories`) — so the
 * queued mutation carries `expectedVersion: null` and can't 409. Degrades to direct online-only
 * behavior when Dexie isn't available, same as `offlineCreate`/`offlineMutate`.
 */
export async function offlineReorder<T>(opts: OfflineReorderOptions<T>): Promise<T> {
	const db = getDb();
	if (!db) return opts.request();

	markSelfMutation(opts.entityType, opts.scopeId);
	const optimisticResult = await opts.applyOptimistically(db);

	const queueId = await enqueueMutation({
		entityType: opts.entityType,
		op: 'reorder',
		targetId: opts.scopeId,
		expectedVersion: null,
		payload: opts.payload,
		url: opts.url
	});

	if (!isOnline()) return optimisticResult;

	try {
		const result = await opts.request();
		await opts.onSuccess(db, result);
		if (queueId !== undefined) await dequeueMutation(queueId);
		return result;
	} catch (err) {
		if (err instanceof ApiError) {
			// A real server rejection can't be resolved by retrying the same payload later.
			if (queueId !== undefined) await dequeueMutation(queueId);
			throw err;
		}
		// Network error — stays queued for the flush loop; caller sees the optimistic rows.
		return optimisticResult;
	}
}
