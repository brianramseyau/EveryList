import { fetchPing } from '$lib/api/ping';
import { onFlushOutcome } from '$lib/offline/flush';
import { pendingMutations } from '$lib/offline/sync-queue';

const PING_INTERVAL_MS = 30_000;

let serverUnavailable = $state(false);
let lastSuccessfulSyncAt = $state<number | null>(null);

let pingInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribeFlush: (() => void) | null = null;
let onOffline: (() => void) | null = null;
let onOnline: (() => void) | null = null;
let started = false;

/** `navigator.onLine === false` is authoritative for the offline case — the
 * service worker's `NetworkFirst` cache could otherwise serve a stale cached
 * response to the probe while offline, masking the outage. */
function isBrowserOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function pingNow(): Promise<void> {
	if (isBrowserOffline()) {
		serverUnavailable = true;
		return;
	}
	const reachable = await fetchPing();
	if (!reachable) {
		serverUnavailable = true;
		return;
	}
	// A bare ping succeeding doesn't mean this client's own queued writes have landed — the
	// flush loop's `online` listener races this same ping on reconnect, and the ping (a single
	// cheap round trip) routinely wins before `flushQueue` has replayed a pending mutation and
	// deleted its optimistic Dexie row. Clearing `serverUnavailable` here anyway let a reload
	// land between the ping's "we're back" and the flush's actual cleanup, catching the stale
	// temp row still merged into `fetchItems`'s result alongside the now-synced server row
	// (see AGENTS.md's offline-sync E2E flake). Pending mutations mean a drain is either running
	// or about to be scheduled — `onFlushOutcome` is the authoritative signal for that case.
	if ((await pendingMutations()).length > 0) return;
	serverUnavailable = false;
	lastSuccessfulSyncAt = Date.now();
}

/**
 * Starts the connectivity monitor: pings `/api/v1/ping` on an interval, reacts
 * to the browser's `online`/`offline` events, and mirrors the flush loop's
 * network outcomes so a failed drain marks the server unavailable immediately
 * without waiting for the next ping. Call once from the root layout; safe to
 * call from a server-rendering context (no-ops without `window`).
 */
export function startConnectivityMonitor(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

	onOffline = () => {
		serverUnavailable = true;
	};
	onOnline = () => {
		void pingNow();
	};
	window.addEventListener('offline', onOffline);
	window.addEventListener('online', onOnline);

	pingInterval = setInterval(() => void pingNow(), PING_INTERVAL_MS);
	unsubscribeFlush = onFlushOutcome(({ ok }) => {
		serverUnavailable = !ok;
		if (ok) lastSuccessfulSyncAt = Date.now();
	});

	void pingNow();
}

/** Test-only: force the unavailable state without going through a ping. */
export function setServerUnavailableForTesting(value: boolean): void {
	serverUnavailable = value;
}

/** Test-only: force the last-successful-sync timestamp without going through a ping. */
export function setLastSuccessfulSyncAtForTesting(value: number | null): void {
	lastSuccessfulSyncAt = value;
}

/** Test-only: resets the module-level state and subscriptions between specs. */
export function resetConnectivityForTesting(): void {
	if (pingInterval) clearInterval(pingInterval);
	pingInterval = null;
	unsubscribeFlush?.();
	unsubscribeFlush = null;
	onFlushOutcome(null);
	if (typeof window !== 'undefined') {
		if (onOffline) window.removeEventListener('offline', onOffline);
		if (onOnline) window.removeEventListener('online', onOnline);
	}
	onOffline = null;
	onOnline = null;
	serverUnavailable = false;
	lastSuccessfulSyncAt = null;
	started = false;
}

export const connectivity = {
	get serverUnavailable() {
		return serverUnavailable;
	},
	get lastSuccessfulSyncAt() {
		return lastSuccessfulSyncAt;
	},
	pingNow
};
