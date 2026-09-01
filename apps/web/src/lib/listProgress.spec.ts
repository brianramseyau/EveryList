import { describe, expect, it } from 'vitest';
import { getProgressDisplayPreference, setProgressDisplayPreference } from './listProgress';

// Runs in the "server" (node) project, which has no `window` — exercises
// the SSR/prerendering guard on every export. See listProgress.svelte.spec.ts
// for the real browser/localStorage behavior.
describe('listProgress (no window)', () => {
	it('getProgressDisplayPreference defaults to remaining', () => {
		expect(getProgressDisplayPreference()).toBe('remaining');
	});

	it('setProgressDisplayPreference is a no-op without throwing', () => {
		expect(() => setProgressDisplayPreference('done')).not.toThrow();
	});
});
