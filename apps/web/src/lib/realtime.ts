import { Transmit } from '@adonisjs/transmit-client';
import type { SyncEventDto } from '@everylist/shared';
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
			baseUrl: window.location.origin,
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
 */
export function subscribeToList(
	listId: number,
	onEvent: (event: SyncEventDto) => void
): () => void {
	const transmit = getClient();
	if (!transmit) return () => {};

	const subscription = transmit.subscription(`list/${listId}`);
	const offMessage = subscription.onMessage<SyncEventDto>(onEvent);
	subscription.create().catch(() => {
		// Connection/auth failures degrade to "no live updates" rather than a
		// thrown error — the list still works from its last fetched state.
	});

	return () => {
		offMessage();
		subscription.delete().catch(() => {});
	};
}

/** Closes and clears the module-level client singleton — used between specs. */
export function resetRealtimeClientForTesting(): void {
	client?.close();
	client = null;
}
