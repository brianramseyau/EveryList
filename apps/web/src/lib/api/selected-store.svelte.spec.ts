import { afterEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '$lib/offline/db';
import { getSelectedStore, setSelectedStore } from './selected-store';

// Runs in the "client" (real Chromium) project for a real IndexedDB round
// trip — see selected-store.spec.ts for the SSR/no-IndexedDB guard.
describe('selected-store (browser)', () => {
	afterEach(async () => {
		await resetDbForTesting();
	});

	it('has no selection by default', async () => {
		await expect(getSelectedStore(1)).resolves.toBeNull();
	});

	it('round-trips a selection through Dexie, keyed per list', async () => {
		await setSelectedStore(1, 20);
		await setSelectedStore(2, 30);

		await expect(getSelectedStore(1)).resolves.toBe(20);
		await expect(getSelectedStore(2)).resolves.toBe(30);
	});

	it('clears the selection when set to null', async () => {
		await setSelectedStore(1, 20);
		await setSelectedStore(1, null);

		await expect(getSelectedStore(1)).resolves.toBeNull();
	});
});
