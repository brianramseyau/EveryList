import { describe, expect, it } from 'vitest';
import { applyTheme, getThemePreference, initTheme, setThemePreference } from './theme';

// Runs in the "server" (node) project, which has no `window` — exercises
// the SSR/prerendering guard on every export. See theme.svelte.spec.ts for
// the real browser/localStorage behavior.
describe('theme (no window)', () => {
	it('getThemePreference defaults to automatic', () => {
		expect(getThemePreference()).toBe('automatic');
	});

	it('applyTheme, setThemePreference, and initTheme are no-ops without throwing', () => {
		expect(() => applyTheme('dark')).not.toThrow();
		expect(() => setThemePreference('light')).not.toThrow();
		expect(() => initTheme()).not.toThrow();
	});
});
