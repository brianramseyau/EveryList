import type { Table } from 'dexie';
import { ApiError } from '$lib/api/client';
import { getDb, type EveryListDB, type SyncEntityType } from './db';
import { dequeueMutation, enqueueMutation } from './sync-queue';

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
		op: 'create',
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
	op: 'update' | 'delete';
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

	const expectedVersion = await opts.applyOptimistically(db);

	const queueId = await enqueueMutation({
		entityType: opts.entityType,
		op: opts.op,
		targetId: opts.targetId,
		expectedVersion,
		payload: opts.payload,
		url: opts.url
	});

	if (!isOnline()) return undefined;

	try {
		const result = await opts.request();
		if (opts.onSuccess) await opts.onSuccess(db, result);
		if (queueId !== undefined) await dequeueMutation(queueId);
		return result;
	} catch (err) {
		if (err instanceof ApiError && err.status !== 409) {
			// A non-conflict server rejection can't be resolved by retrying later.
			if (queueId !== undefined) await dequeueMutation(queueId);
			throw err;
		}
		// Network error, or a 409 the flush loop will reconcile — stays queued.
		return undefined;
	}
}
