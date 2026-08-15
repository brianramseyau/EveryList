import { describe, expect, it } from 'vitest';
import { applyAccent, getAccentPreference, initAccent, setAccentPreference } from './accent';

// Runs in the "server" (node) project, which has no `window` — exercises
// the SSR/prerendering guard on every export. See accent.svelte.spec.ts for
// the real browser/localStorage behavior.
describe('accent (no window)', () => {
	it('getAccentPreference defaults to ocean', () => {
		expect(getAccentPreference()).toBe('ocean');
	});

	it('applyAccent, setAccentPreference, and initAccent are no-ops without throwing', () => {
		expect(() => applyAccent('forest')).not.toThrow();
		expect(() => setAccentPreference('berry')).not.toThrow();
		expect(() => initAccent()).not.toThrow();
	});
});
