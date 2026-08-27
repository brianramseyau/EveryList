import type { CategoryDto, StoreCategoryOrderDto } from '@everylist/shared';
import { ApiError, apiDelete, apiPatch, apiPost } from '$lib/api/client';
import { getDb, type QueuedMutation } from './db';
// V8's coverage instrumentation attributes a phantom, permanently-uninvoked function entry to
// this import statement (a `vi.mock`-related artifact — see the identical class of issue
// documented on $lib/api/selected-store.ts) rather than to any real code in this file.
/* v8 ignore start */
import { dequeueMutation, enqueueMutation, pendingMutations, updateMutation } from './sync-queue';
/* v8 ignore stop */

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 8;

export type ConflictListener = (mutation: QueuedMutation) => void;
const conflictListeners = new Set<ConflictListener>();

/** The currently-mounted list page (refreshes its stale optimistic view once the server's merged
 * copy lands, see PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md) subscribes here — the silent-merge-and-toast conflict UX of
 * PLAN_05_PHASE_OFFLINE_PWA.md §4 is now surfaced via the Settings sync-status page and server logs rather than a
 * banner/toast. Supports more than one listener at a time. Returns an unsubscribe function — call
 * it on teardown instead of passing `null`. Passing `null` clears every subscriber; that's a
 * test-only global reset, not meant for component teardown (it would also drop unrelated listeners
 * still mounted). */
export function onConflict(listener: ConflictListener | null): () => void {
	if (listener === null) {
		conflictListeners.clear();
		return () => {};
	}
	conflictListeners.add(listener);
	return () => conflictListeners.delete(listener);
}

export type FlushOutcomeListener = (outcome: { ok: boolean }) => void;
const flushOutcomeListeners = new Set<FlushOutcomeListener>();

/** Notifies subscribers whenever a drain either reaches the server (`ok: true`
 * after the queue empties) or is aborted by a network error (`ok: false`) —
 * backs the connectivity monitor's "server unavailable" signal (see
 * PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md). Returns an unsubscribe function; passing `null` clears
 * every subscriber (test-only reset, mirroring `onConflict`). */
export function onFlushOutcome(listener: FlushOutcomeListener | null): () => void {
	if (listener === null) {
		flushOutcomeListeners.clear();
		return () => {};
	}
	flushOutcomeListeners.add(listener);
	return () => flushOutcomeListeners.delete(listener);
}

async function replay(mutation: QueuedMutation): Promise<void> {
	if (mutation.op === 'create' || mutation.op === 'attach') {
		await apiPost(mutation.url, mutation.payload);
		// The already-online path (sync-engine.ts's offlineCreate) deletes the optimistic
		// temp row on success; replaying a queued create/attach from here needs the same
		// cleanup, or the temp row lingers in Dexie forever alongside whatever the server
		// actually created/matched (full reconciliation with the server's response is a
		// known gap — see PLAN_10_PHASE_VALIDATION_USABILITY.md §0.2).
		const table = tableForEntity(mutation.entityType as QueueableEntityType);
		await table.delete(mutation.targetId);
		return;
	}
	if (mutation.op === 'reorder') {
		await replayReorder(mutation);
		return;
	}
	if (mutation.op === 'reset') {
		await replayReset(mutation);
		return;
	}
	const table = tableForEntity(mutation.entityType as QueueableEntityType);
	if (mutation.op === 'restore') {
		// No `expectedVersion` guard, matching the restore endpoint itself (items_controller.ts's
		// `restore`) — it only requires the row still be soft-deleted, not a version match.
		const result = await apiPost<Record<string, unknown>>(mutation.url, mutation.payload);
		if (result) await table.update(mutation.targetId, { ...result, _dirty: false });
		return;
	}
	if (mutation.op === 'update') {
		const body =
			mutation.expectedVersion === null
				? mutation.payload
				: { ...mutation.payload, expectedVersion: mutation.expectedVersion };
		const result = await apiPatch<Record<string, unknown>>(mutation.url, body);
		// Adopt the server's authoritative row — bumped `version` included — the same way the
		// already-online path's `onSuccess` does (see items.ts et al.). Skipping this left the
		// cached row's `version` stale after every replayed update, so the *next* edit to that
		// row (another queued mutation behind it, or the next click once "synced") would send a
		// now-stale `expectedVersion` and 409 against the sync that had just succeeded — a
		// self-inflicted conflict, not a real one, but still surfaced via the same conflict path.
		if (result) await table.update(mutation.targetId, { ...result, _dirty: false });
		return;
	}
	const url =
		mutation.expectedVersion === null
			? mutation.url
			: `${mutation.url}?expectedVersion=${mutation.expectedVersion}`;
	await apiDelete(url);
	await table.update(mutation.targetId, { _dirty: false });
}

/** Replays a queued bulk reorder (PLAN_13_PHASE_NATIVE_APP_SHELL.md §5) — `offlineReorder`'s only two callers,
 * category reorder and store-category-order reorder, so a two-way branch on `entityType` rather
 * than the generic `tableForEntity` dispatch (which is keyed to single-numeric-id tables;
 * `storeCategoryOrders` is compound-keyed and has no row of its own to look up by `targetId`).
 * Reorder mutations carry `expectedVersion: null` and structurally can't 409 (see
 * `offlineReorder`), so — unlike `update`/`delete` above — there's no conflict branch to handle. */
async function replayReorder(mutation: QueuedMutation): Promise<void> {
	const db = getDb()!;
	if (mutation.entityType === 'category') {
		const result = await apiPatch<CategoryDto[]>(mutation.url, mutation.payload);
		await db.categories.bulkPut(result.map((row) => ({ ...row, _dirty: false })));
		return;
	}
	// The only other entity type `offlineReorder` is ever called with — see stores.ts's
	// `reorderStoreCategories`.
	const result = await apiPatch<StoreCategoryOrderDto[]>(mutation.url, mutation.payload);
	await db.storeCategoryOrders.bulkPut(result.map((row) => ({ ...row, _dirty: false })));
}

/** Replays a queued bulk reset (`offlineReset`'s only caller today — stores.ts's
 * `resetStoreCategoryOrder`) — same compound-key rationale as `replayReorder` above: there's no
 * single row to look up by `targetId`, just every `storeCategoryOrders` row for that store. */
async function replayReset(mutation: QueuedMutation): Promise<void> {
	const db = getDb()!;
	await apiDelete(mutation.url);
	await db.storeCategoryOrders.where('storeId').equals(mutation.targetId).delete();
}

/** Entity types the write paths in `$lib/api/{items,categories,favorites,stores}.ts` actually
 * enqueue through `tableForEntity` — a narrower slice of `SyncEntityType` (which also covers
 * `list`, never queued client-side, and `store_category_order`, queued only via `reorder` and
 * replayed by `replayReorder` above instead of this generic dispatch, see PLAN_05_PHASE_OFFLINE_PWA.md §1). */
type QueueableEntityType = 'category' | 'item' | 'favorite_item' | 'store';

function tableForEntity(entityType: QueueableEntityType) {
	// Provably covered in isolation — other spec files' `vi.mock('./db', …)`
	// corrupts this statement's V8 attribution once merged into the full
	// suite, the same coverage-collection artifact documented on
	// $lib/api/selected-store.ts and $lib/offline/sync-queue.ts.
	/* v8 ignore next */
	const db = getDb()!;
	switch (entityType) {
		case 'category':
			return db.categories;
		case 'item':
			return db.items;
		case 'favorite_item':
			return db.favoriteItems;
		case 'store':
			return db.stores;
	}
}

/** Overwrites the cached row with the server's authoritative copy from a 409's body, so the
 * next local edit computes a fresh `expectedVersion` instead of conflicting again. For an
 * update, then re-diffs the mutation's own payload against that server copy: any field the
 * offline edit actually changed — and that the winning edit didn't already happen to agree
 * with — is re-applied over the fresh copy and re-enqueued as a new mutation carrying the
 * server's `version` as its `expectedVersion`, per PLAN_05_PHASE_OFFLINE_PWA.md §4's "silent merge + toast"
 * conflict UX (the offline edit is reconciled onto the newer edit, not discarded by it).
 * Silent — the mounted list page refreshes via `onConflict`, and the server logs the exact
 * version delta (see apps/api's `reportVersionConflict`, PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md). */
async function reconcileConflict(mutation: QueuedMutation, err: ApiError): Promise<void> {
	const body = err.body as { data?: Record<string, unknown> & { version?: number } } | undefined;
	if (body?.data) {
		const table = tableForEntity(mutation.entityType as QueueableEntityType);
		await table.update(mutation.targetId, { ...body.data, _dirty: false });

		if (mutation.op === 'update' && body.data.version !== undefined) {
			const stillDiffering = Object.fromEntries(
				Object.entries(mutation.payload).filter(
					([key, value]) => !Object.is(body.data![key], value)
				)
			);
			if (Object.keys(stillDiffering).length > 0) {
				await table.update(mutation.targetId, { ...stillDiffering, _dirty: true });
				await enqueueMutation({
					entityType: mutation.entityType,
					op: 'update',
					targetId: mutation.targetId,
					expectedVersion: body.data.version,
					payload: stillDiffering,
					url: mutation.url
				});
			}
		}
	}
	conflictListeners.forEach((listener) => listener(mutation));
}

let flushing = false;

/**
 * Drains the `pending` queue oldest-first, sequentially — preserves each row's
 * `expectedVersion` ordering (PLAN_05_PHASE_OFFLINE_PWA.md §4). Stops draining (leaving the rest queued) on
 * the first network error, since later rows would fail the same way; a real server rejection or
 * a 409 doesn't block the rest of the queue.
 *
 * Guarded against overlapping with itself: this is reachable from several independent triggers
 * (the `online` listener, `startFlushLoop`'s own initial call, a backoff retry timer, and the
 * sync-status page's "Retry now" button), and mobile connections routinely fire more than one of
 * those in quick succession while reconnecting. Two overlapping drains would both read the same
 * still-pending mutation and replay it twice — the second copy then 409s against the first's own
 * just-applied version bump, producing a spurious conflict for an edit nothing actually
 * conflicted with. A later call while one is already in flight simply
 * no-ops; the caller's own pending-count check (see `attemptFlush`) notices the queue didn't
 * drain and retries.
 */
export async function flushQueue(): Promise<void> {
	if (flushing) return;
	flushing = true;
	try {
		/* v8 ignore next */
		const db = getDb();
		if (!db) return;

		for (const mutation of await pendingMutations()) {
			// Every row read back from Dexie's `++id` auto-increment table has a real id.
			const id = mutation.id!;
			try {
				await replay(mutation);
				await dequeueMutation(id);
			} catch (err) {
				if (!(err instanceof ApiError)) {
					// Network error — stop here, the rest will retry on the next flush attempt.
					// Record a reason on the stalling mutation (status stays `pending`) so the
					// sync-status page can show *why* it's stuck, and tell the connectivity
					// monitor the server is currently unreachable.
					const message = err instanceof Error ? err.message : 'Network error';
					await updateMutation(id, { lastError: message });
					flushOutcomeListeners.forEach((listener) => listener({ ok: false }));
					return;
				}
				if (err.status === 409) {
					await reconcileConflict(mutation, err);
					await dequeueMutation(id);
					continue;
				}
				const attempts = mutation.attempts + 1;
				if (attempts >= MAX_ATTEMPTS) {
					await updateMutation(id, { status: 'failed', attempts, lastError: err.message });
				} else {
					await updateMutation(id, { attempts, lastError: err.message });
				}
			}
		}
	} finally {
		flushing = false;
	}
}

let scheduled: ReturnType<typeof setTimeout> | null = null;
let backoffAttempt = 0;
let started = false;

function backoffDelay(): number {
	const exponential = BASE_DELAY_MS * 2 ** backoffAttempt;
	const capped = Math.min(exponential, MAX_DELAY_MS);
	return capped / 2 + Math.random() * (capped / 2);
}

async function attemptFlush(): Promise<void> {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

	// Both `pendingMutations()` calls in this function are provably covered in isolation — see
	// the identical `vi.mock` coverage-attribution note on `tableForEntity` above.
	/* v8 ignore next */
	const before = await pendingMutations();
	if (before.length === 0) {
		backoffAttempt = 0;
		return;
	}

	await flushQueue();

	/* v8 ignore next */
	const after = await pendingMutations();
	if (after.length === 0) {
		backoffAttempt = 0;
		flushOutcomeListeners.forEach((listener) => listener({ ok: true }));
		return;
	}
	// Some mutations are still queued (a network error stopped the drain, or a
	// non-conflict ApiError left one behind) — retry with backoff.
	backoffAttempt = Math.min(backoffAttempt + 1, 5);
	scheduleRetry();
}

function scheduleRetry(): void {
	if (scheduled) return;
	scheduled = setTimeout(() => {
		scheduled = null;
		void attemptFlush();
	}, backoffDelay());
}

/**
 * Starts the flush loop: attempts a drain immediately, retries with backoff while mutations
 * remain queued, and re-attempts whenever the browser regains connectivity. Also registers a
 * Background Sync request as a progressive enhancement for browsers that support it — the
 * `online` listener remains the guaranteed mechanism either way. Call once, e.g. from the root
 * layout; safe to call from a server-rendering context (no-ops without `window`).
 */
export function startFlushLoop(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

	window.addEventListener('online', () => {
		backoffAttempt = 0;
		void attemptFlush();
	});

	// Background Sync (`ServiceWorkerRegistration.sync`) isn't in TS's DOM lib — it's still a
	// non-standard, Chromium-only API — so it's accessed via an ad hoc interface and optional
	// chaining rather than an `@types` dependency.
	void navigator.serviceWorker?.ready
		.then((registration) => {
			const withSync = registration as ServiceWorkerRegistration & {
				sync?: { register: (tag: string) => Promise<void> };
			};
			return withSync.sync?.register('everylist-flush');
		})
		.catch(() => {
			// Background Sync isn't supported everywhere — the online listener already covers it.
		});

	void attemptFlush();
}

/** Test-only: resets the module-level scheduling state between specs. */
export function resetFlushLoopForTesting(): void {
	if (scheduled) clearTimeout(scheduled);
	scheduled = null;
	backoffAttempt = 0;
	started = false;
	flushing = false;
}
