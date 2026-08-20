import { afterEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTesting } from '$lib/offline/db';
import { getSelectedStoreSettings, setSelectedStoreSettings } from './selected-store';

// Runs in the "client" (real Chromium) project for a real IndexedDB round
// trip — see selected-store.spec.ts for the SSR/no-IndexedDB guard.
describe('selected-store (browser)', () => {
	afterEach(async () => {
		await resetDbForTesting();
	});

	it('has no selection by default', async () => {
		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: null,
			filter: 'store'
		});
	});

	it('round-trips a selection through Dexie, keyed per list', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'store' });
		await setSelectedStoreSettings(2, { storeId: 30, filter: 'store' });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 20,
			filter: 'store'
		});
		await expect(getSelectedStoreSettings(2)).resolves.toEqual({
			storeId: 30,
			filter: 'store'
		});
	});

	it('clears the selection when set to null', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'store' });
		await setSelectedStoreSettings(1, { storeId: null, filter: 'store' });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: null,
			filter: 'store'
		});
	});

	it('defaults the filter to "store"', async () => {
		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: null,
			filter: 'store'
		});
	});

	it('round-trips the store and filter together', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'storeAndUnassigned' });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 20,
			filter: 'storeAndUnassigned'
		});
	});

	it('persists the filter independently of the store selection', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, filter: 'storeAndUnassigned' });
		await setSelectedStoreSettings(1, { storeId: 21, filter: 'storeAndUnassigned' });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 21,
			filter: 'storeAndUnassigned'
		});
	});

	it('migrates legacy rows that persisted includeUnassigned instead of filter', async () => {
		// Rows written by an older build stored `includeUnassigned` rather than
		// `filter` — reading them must translate to the equivalent filter value.
		const db = getDb()!;
		await db.selectedStore.put({ listId: 1, storeId: 20, includeUnassigned: true });
		await db.selectedStore.put({ listId: 2, storeId: 30, includeUnassigned: false });
		await db.selectedStore.put({ listId: 3, storeId: null, includeUnassigned: true });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 20,
			filter: 'storeAndUnassigned'
		});
		await expect(getSelectedStoreSettings(2)).resolves.toEqual({
			storeId: 30,
			filter: 'store'
		});
		await expect(getSelectedStoreSettings(3)).resolves.toEqual({
			storeId: null,
			filter: 'store'
		});
	});
});
