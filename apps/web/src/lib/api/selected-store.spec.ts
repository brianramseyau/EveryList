import { describe, expect, it } from 'vitest';
import { getSelectedStore, setSelectedStore } from './selected-store';

// Runs in the "server" (node) project — no `window`, so this exercises the
// SSR/prerendering guard. See selected-store.svelte.spec.ts for the real
// localStorage round trip in a browser.
describe('selected-store (no window)', () => {
	it('getSelectedStore returns null without throwing', () => {
		expect(getSelectedStore(1)).toBeNull();
	});

	it('setSelectedStore is a no-op without throwing', () => {
		expect(() => setSelectedStore(1, 20)).not.toThrow();
	});
});
