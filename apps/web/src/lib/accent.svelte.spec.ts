import { afterEach, describe, expect, it } from 'vitest';
import { applyAccent, getAccentPreference, initAccent, setAccentPreference } from './accent';

// Runs in the "client" (real Chromium) project so `window.localStorage` and
// `document.documentElement` are the genuine browser implementations — see
// accent.spec.ts for the SSR/no-window guard.
describe('accent (browser)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:accent');
		document.documentElement.removeAttribute('data-accent');
	});

	it('defaults to slate when nothing is stored', () => {
		expect(getAccentPreference()).toBe('slate');
	});

	it('ignores a corrupted stored value and falls back to slate', () => {
		window.localStorage.setItem('everylist:accent', 'not-a-real-accent');
		expect(getAccentPreference()).toBe('slate');
	});

	it('applyAccent sets the data-accent attribute', () => {
		applyAccent('forest');
		expect(document.documentElement.getAttribute('data-accent')).toBe('forest');
	});

	it('setAccentPreference persists the choice and applies it immediately', () => {
		setAccentPreference('berry');

		expect(window.localStorage.getItem('everylist:accent')).toBe('berry');
		expect(getAccentPreference()).toBe('berry');
		expect(document.documentElement.getAttribute('data-accent')).toBe('berry');
	});

	it('initAccent applies whatever preference is already stored', () => {
		window.localStorage.setItem('everylist:accent', 'sunset');
		initAccent();
		expect(document.documentElement.getAttribute('data-accent')).toBe('sunset');
	});
});
