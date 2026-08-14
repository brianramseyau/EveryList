import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, getThemePreference, initTheme, setThemePreference } from './theme';

// Runs in the "client" (real Chromium) project so `window.localStorage`,
// `matchMedia`, and `document.documentElement` are the genuine browser
// implementations — see theme.spec.ts for the SSR/no-window guard.
describe('theme (browser)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:theme');
		document.documentElement.classList.remove('dark');
	});

	it('defaults to automatic when nothing is stored', () => {
		expect(getThemePreference()).toBe('automatic');
	});

	it('ignores a corrupted stored value and falls back to automatic', () => {
		window.localStorage.setItem('everylist:theme', 'not-a-real-preference');
		expect(getThemePreference()).toBe('automatic');
	});

	it('applyTheme("dark") adds the dark class', () => {
		applyTheme('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('applyTheme("light") removes the dark class', () => {
		document.documentElement.classList.add('dark');
		applyTheme('light');
		expect(document.documentElement.classList.contains('dark')).toBe(false);
	});

	it('setThemePreference persists the choice and applies it immediately', () => {
		setThemePreference('dark');

		expect(window.localStorage.getItem('everylist:theme')).toBe('dark');
		expect(getThemePreference()).toBe('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	// Must run before any other test in this file calls initTheme(): the OS
	// change listener is attached at most once per page load (module-level
	// `systemListenerAttached`), so this needs to be the call that attaches
	// it in order to control what `window.matchMedia` hands back.
	it('re-applies the automatic preference when the OS scheme changes', () => {
		// Real browsers return the *same* MediaQueryList instance for a given
		// query string, so the listener initTheme() attaches internally is
		// the same object a later `window.matchMedia(...)` call gets back —
		// stub it here with a shared EventTarget to make that guarantee
		// explicit and dispatch a real 'change' event against it.
		class FakeMediaQueryList extends EventTarget {
			matches = false;
		}
		const shared = new FakeMediaQueryList();
		const originalMatchMedia = window.matchMedia;
		window.matchMedia = (() => shared) as unknown as typeof window.matchMedia;

		try {
			setThemePreference('automatic');
			document.documentElement.classList.add('dark');
			initTheme();

			shared.dispatchEvent(new Event('change'));

			expect(document.documentElement.classList.contains('dark')).toBe(false);

			// A change event while the preference is no longer "automatic"
			// (the user picked an explicit theme in the meantime) must be
			// ignored — it shouldn't flip the class back.
			setThemePreference('light');
			document.documentElement.classList.add('dark');

			shared.dispatchEvent(new Event('change'));

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		} finally {
			window.matchMedia = originalMatchMedia;
		}
	});

	it('initTheme applies whatever preference is already stored', () => {
		window.localStorage.setItem('everylist:theme', 'dark');
		initTheme();
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('initTheme is safe to call more than once and keeps automatic listening for OS changes', () => {
		setThemePreference('automatic');
		initTheme();
		initTheme();

		const query = window.matchMedia('(prefers-color-scheme: dark)');
		expect(() => query.dispatchEvent(new Event('change'))).not.toThrow();
	});
});
