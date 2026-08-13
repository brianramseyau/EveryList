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
