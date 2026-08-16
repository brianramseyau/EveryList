import { afterEach, describe, expect, it } from 'vitest';
import { getShowChecked, setShowChecked } from './list-prefs';

// Runs in the "client" (real Chromium) project so `window.localStorage` is
// the genuine browser implementation — see list-prefs.spec.ts for the
// SSR/no-window guard.
describe('list-prefs (browser)', () => {
	afterEach(() => {
		window.localStorage.clear();
	});

	it('defaults to showing checked items when nothing has been stored', () => {
		expect(getShowChecked(7)).toBe(true);
	});

	it('remembers the choice for that exact list, not others', () => {
		setShowChecked(7, false);
		expect(getShowChecked(7)).toBe(false);
		expect(getShowChecked(8)).toBe(true);
	});

	it('setShowChecked(true) round-trips back to the default state', () => {
		setShowChecked(7, false);
		setShowChecked(7, true);
		expect(getShowChecked(7)).toBe(true);
	});
});
