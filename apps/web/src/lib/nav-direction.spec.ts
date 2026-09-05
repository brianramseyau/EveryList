import { describe, expect, it } from 'vitest';
import {
	consumeListScroll,
	consumeNavDirection,
	consumeSkipTransition,
	getRememberListScrollPreference,
	markBackNavigation,
	markSkipTransition,
	rememberListScroll,
	setRememberListScrollPreference
} from './nav-direction';

describe('nav-direction', () => {
	it('defaults to forward when nothing was marked and it is not a popstate back', () => {
		expect(consumeNavDirection(false)).toBe('forward');
	});

	it('reports back for a real popstate back navigation, even unmarked', () => {
		expect(consumeNavDirection(true)).toBe('back');
	});

	it('reports back once markBackNavigation is called, then resets', () => {
		markBackNavigation();

		expect(consumeNavDirection(false)).toBe('back');
		expect(consumeNavDirection(false)).toBe('forward');
	});

	it('reports skip once markSkipTransition is called, then resets', () => {
		markSkipTransition();

		expect(consumeSkipTransition()).toBe(true);
		expect(consumeSkipTransition()).toBe(false);
	});

	it('returns the remembered scroll position for a matching listId, then resets', () => {
		rememberListScroll(1, 400);

		expect(consumeListScroll(1)).toBe(400);
		expect(consumeListScroll(1)).toBeNull();
	});

	it('returns null, and still resets, for a mismatched listId', () => {
		rememberListScroll(1, 400);

		expect(consumeListScroll(2)).toBeNull();
		expect(consumeListScroll(1)).toBeNull();
	});

	it('returns null when nothing was remembered', () => {
		expect(consumeListScroll(1)).toBeNull();
	});

	// Runs in the "server" (node) project, which has no `window` — getRememberListScrollPreference
	// defaults to enabled there and setRememberListScrollPreference is a no-op, same rationale as
	// $lib/shake.ts's own no-window guard. See nav-direction.svelte.spec.ts for the real
	// localStorage-backed toggle.
	it('getRememberListScrollPreference defaults to enabled without a window', () => {
		expect(getRememberListScrollPreference()).toBe(true);
	});

	it('setRememberListScrollPreference is a no-op without a window', () => {
		expect(() => setRememberListScrollPreference(false)).not.toThrow();
		expect(getRememberListScrollPreference()).toBe(true);
	});
});
