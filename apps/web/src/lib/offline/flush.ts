import { ApiError, apiDelete, apiPatch, apiPost } from '$lib/api/client';
import { getDb, type QueuedMutation } from './db';
// V8's coverage instrumentation attributes a phantom, permanently-uninvoked function entry to
// this import statement (a `vi.mock`-related artifact — see the identical class of issue
// documented on $lib/api/selected-store.ts) rather than to any real code in this file.
/* v8 ignore start */
import { dequeueMutation, pendingMutations, updateMutation } from './sync-queue';
/* v8 ignore stop */

const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 8;

export type ConflictListener = (mutation: QueuedMutation) => void;
let conflictListener: ConflictListener | null = null;

/** The SyncStatusBanner subscribes here to toast "some changes were reconciled" — see
 * PHASE5_PLAN.md §4's silent-merge-and-toast conflict UX. */
export function onConflict(listener: ConflictListener | null): void {
	conflictListener = listener;
}

async function replay(mutation: QueuedMutation): Promise<void> {
	if (mutation.op === 'create') {
		await apiPost(mutation.url, mutation.payload);
		// The already-online path (sync-engine.ts's offlineCreate) deletes the optimistic
		// temp row on success; replaying a queued create from here needs the same cleanup,
		// or the temp row lingers in Dexie forever alongside whatever the server actually
		// created/matched (full reconciliation with the server's response is a known gap —
		// see PHASE10_PLAN.md §0.2).
		const table = tableForEntity(mutation.entityType as QueueableEntityType);
		await table.delete(mutation.targetId);
		return;
	}
	if (mutation.op === 'update') {
		const body =
			mutation.expectedVersion === null
				? mutation.payload
				: { ...mutation.payload, expectedVersion: mutation.expectedVersion };
		await apiPatch(mutation.url, body);
		return;
	}
	const url =
		mutation.expectedVersion === null
			? mutation.url
			: `${mutation.url}?expectedVersion=${mutation.expectedVersion}`;
	await apiDelete(url);
}

/** Entity types the write paths in `$lib/api/{items,categories,favorites,stores}.ts` actually
 * enqueue — a narrower slice of `SyncEntityType` (which also covers `list`/`store_category_order`
 * for the backend's broadcast contract, neither ever queued client-side, see PHASE5_PLAN.md §1). */
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
 * next local edit computes a fresh `expectedVersion` instead of conflicting again. Silent —
 * the caller surfaces a toast via `onConflict`, per the confirmed "silent merge + toast" UX. */
async function reconcileConflict(mutation: QueuedMutation, err: ApiError): Promise<void> {
	const body = err.body as { data?: Record<string, unknown> } | undefined;
	if (body?.data) {
		const table = tableForEntity(mutation.entityType as QueueableEntityType);
		await table.update(mutation.targetId, { ...body.data, _dirty: false });
	}
	conflictListener?.(mutation);
}

/**
 * Drains the `pending` queue oldest-first, sequentially — preserves each row's
 * `expectedVersion` ordering (PHASE5_PLAN.md §4). Stops draining (leaving the rest queued) on
 * the first network error, since later rows would fail the same way; a real server rejection or
 * a 409 doesn't block the rest of the queue.
 */
export async function flushQueue(): Promise<void> {
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
}
