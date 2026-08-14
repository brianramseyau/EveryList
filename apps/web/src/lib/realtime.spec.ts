import { describe, expect, it } from 'vitest';
import { resetRealtimeClientForTesting, subscribeToList } from './realtime';

// Runs in the "server" (node) project — no `window`, so this exercises the
// SSR/prerendering guard. See realtime.svelte.spec.ts for the real
// (mocked-Transmit) subscribe/unsubscribe flow in a browser.
describe('realtime (no window)', () => {
	it('subscribeToList returns a no-op unsubscribe without throwing', () => {
		const unsubscribe = subscribeToList(1, () => {});
		expect(() => unsubscribe()).not.toThrow();
	});

	it('resetRealtimeClientForTesting is a no-op without throwing', () => {
		expect(() => resetRealtimeClientForTesting()).not.toThrow();
	});
});
