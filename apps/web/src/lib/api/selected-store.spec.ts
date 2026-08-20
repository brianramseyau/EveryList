import { describe, expect, it } from 'vitest';
import { getSelectedStoreSettings, setSelectedStoreSettings } from './selected-store';

// Runs in the "server" (node) project — no `indexedDB`, so this exercises
// the SSR/prerendering guard. See selected-store.svelte.spec.ts for the
// real Dexie/IndexedDB round trip in a browser.
describe('selected-store (no IndexedDB)', () => {
	it('getSelectedStoreSettings resolves to defaults without throwing', async () => {
		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: null,
			filter: 'store'
		});
	});

	it('setSelectedStoreSettings resolves without throwing', async () => {
		await expect(
			setSelectedStoreSettings(1, { storeId: 20, filter: 'all' })
		).resolves.toBeUndefined();
	});
});
