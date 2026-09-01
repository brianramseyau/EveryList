import { afterEach, describe, expect, it } from 'vitest';
import { getProgressDisplayPreference, setProgressDisplayPreference } from './listProgress';

// Runs in the "client" (real Chromium) project so `window.localStorage` is
// the genuine browser implementation — see listProgress.spec.ts for the
// SSR/no-window guard.
describe('listProgress (browser)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:progressDisplay');
	});

	it('defaults to remaining when nothing is stored', () => {
		expect(getProgressDisplayPreference()).toBe('remaining');
	});

	it('ignores a corrupted stored value and falls back to remaining', () => {
		window.localStorage.setItem('everylist:progressDisplay', 'not-a-real-preference');
		expect(getProgressDisplayPreference()).toBe('remaining');
	});

	it('setProgressDisplayPreference persists the choice', () => {
		setProgressDisplayPreference('done');

		expect(window.localStorage.getItem('everylist:progressDisplay')).toBe('done');
		expect(getProgressDisplayPreference()).toBe('done');
	});
});
