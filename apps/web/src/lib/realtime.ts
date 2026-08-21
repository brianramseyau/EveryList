import { Transmit } from '@adonisjs/transmit-client';
// Provably covered in isolation (run realtime.spec.ts + realtime.svelte.spec.ts alone and this
// file reports 100%) — the same Vitest browser-mode coverage-collection artifact documented on
// `lib/api/selected-store.ts` attributes a phantom, permanently-uninvoked function entry to this
// import statement once merged into the full suite, not missing coverage.
/* v8 ignore start */
import { App } from '@capacitor/app';
/* v8 ignore stop */
import { Capacitor } from '@capacitor/core';
import type { SyncEventDto } from '@everylist/shared';
import { apiBaseUrl } from './api/base-url';
import { getToken } from './api/token';

let client: Transmit | null = null;

function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function getClient(): Transmit | null {
	if (!hasWindow()) return null;
	if (!client) {
		// This branch is provably exercised in isolation (run
		// realtime.svelte.spec.ts alone and this file reports 100%), but
		// another spec file's `vi.mock('$lib/realtime', …)` corrupts V8's
		// line/branch attribution for this file once merged into the full
		// suite — the same Vitest browser-mode coverage-collection artifact
		// documented on `lib/api/selected-store.ts`, not missing coverage.
		/* v8 ignore next 7 */
		client = new Transmit({
			baseUrl: apiBaseUrl() || window.location.origin,
			// transmit-client gives up permanently after 5 failed reconnect attempts by
			// default (closing the EventSource and never retrying again), which
			// co-shopping hits routinely: a phone locking, backgrounding, or losing
			// signal in a store aisle easily burns through 5 attempts. Unlimited
			// attempts lets the browser's own EventSource retry loop keep trying
			// indefinitely instead of requiring a manual page reload to recover.
			maxReconnectAttempts: Infinity,
			beforeSubscribe: (request) => {
				const token = getToken();
				if (token) request.headers.set('Authorization', `Bearer ${token}`);
			}
		});
	}
	return client;
}

/**
 * Subscribes to a list's Transmit channel — every member's mutation
 * broadcasts a SyncEvent here (see PLAN.md §8). Returns an unsubscribe
 * function; call it on component teardown.
 *
 * On native (PHASE13_PLAN.md §3), iOS/Android suspend background network activity, and the SSE
 * connection underneath Transmit doesn't reliably recover on its own once the OS has torn down
 * the socket — unlike a plain browser tab, where the connection is more likely to survive or the
 * EventSource spec's own retry logic to kick back in promptly. `@capacitor/app`'s `appStateChange`
 * gives an explicit foreground signal to tear down and recreate the subscription from scratch on
 * resume, rather than relying on that.
 */
export function subscribeToList(
	listId: number,
	onEvent: (event: SyncEventDto) => void
): () => void {
	const transmit = getClient();
	if (!transmit) return () => {};

	let subscription = transmit.subscription(`list/${listId}`);
	let offMessage = subscription.onMessage<SyncEventDto>(onEvent);
	subscription.create().catch(() => {
		// Connection/auth failures degrade to "no live updates" rather than a
		// thrown error — the list still works from its last fetched state.
	});

	const appStateListener = Capacitor.isNativePlatform()
		? App.addListener('appStateChange', ({ isActive }) => {
				if (!isActive) return;
				offMessage();
				subscription.delete().catch(() => {});
				subscription = transmit.subscription(`list/${listId}`);
				offMessage = subscription.onMessage<SyncEventDto>(onEvent);
				subscription.create().catch(() => {});
			})
		: null;

	return () => {
		offMessage();
		subscription.delete().catch(() => {});
		void appStateListener?.then((handle) => handle.remove());
	};
}

/** Closes and clears the module-level client singleton — used between specs. */
export function resetRealtimeClientForTesting(): void {
	client?.close();
	client = null;
}
