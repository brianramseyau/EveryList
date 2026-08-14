import { describe, expect, it } from 'vitest';
import { getSelectedStore, setSelectedStore } from './selected-store';

// Runs in the "server" (node) project — no `indexedDB`, so this exercises
// the SSR/prerendering guard. See selected-store.svelte.spec.ts for the
// real Dexie/IndexedDB round trip in a browser.
describe('selected-store (no IndexedDB)', () => {
	it('getSelectedStore resolves to null without throwing', async () => {
		await expect(getSelectedStore(1)).resolves.toBeNull();
	});

	it('setSelectedStore resolves without throwing', async () => {
		await expect(setSelectedStore(1, 20)).resolves.toBeUndefined();
	});
});
