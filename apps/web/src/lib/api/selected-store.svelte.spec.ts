import { afterEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '$lib/offline/db';
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
			includeUnassigned: false
		});
	});

	it('round-trips a selection through Dexie, keyed per list', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, includeUnassigned: false });
		await setSelectedStoreSettings(2, { storeId: 30, includeUnassigned: false });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 20,
			includeUnassigned: false
		});
		await expect(getSelectedStoreSettings(2)).resolves.toEqual({
			storeId: 30,
			includeUnassigned: false
		});
	});

	it('clears the selection when set to null', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, includeUnassigned: false });
		await setSelectedStoreSettings(1, { storeId: null, includeUnassigned: false });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: null,
			includeUnassigned: false
		});
	});

	it('defaults the unassigned-items flag to false', async () => {
		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: null,
			includeUnassigned: false
		});
	});

	it('round-trips the store and unassigned-items flag together', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, includeUnassigned: true });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 20,
			includeUnassigned: true
		});
	});

	it('persists the unassigned-items flag independently of the store selection', async () => {
		await setSelectedStoreSettings(1, { storeId: 20, includeUnassigned: true });
		await setSelectedStoreSettings(1, { storeId: 21, includeUnassigned: true });

		await expect(getSelectedStoreSettings(1)).resolves.toEqual({
			storeId: 21,
			includeUnassigned: true
		});
	});
});
