import { afterEach, describe, expect, it } from 'vitest';
import { getSelectedStore, setSelectedStore } from './selected-store';

// Runs in the "client" (real Chromium) project for real localStorage — see
// selected-store.spec.ts for the SSR/no-window guard.
describe('selected-store (browser)', () => {
	afterEach(() => {
		setSelectedStore(1, null);
		setSelectedStore(2, null);
	});

	it('has no selection by default', () => {
		expect(getSelectedStore(1)).toBeNull();
	});

	it('round-trips a selection through localStorage, keyed per list', () => {
		setSelectedStore(1, 20);
		setSelectedStore(2, 30);

		expect(getSelectedStore(1)).toBe(20);
		expect(getSelectedStore(2)).toBe(30);
	});

	it('clears the selection when set to null', () => {
		setSelectedStore(1, 20);
		setSelectedStore(1, null);

		expect(getSelectedStore(1)).toBeNull();
	});
});
