import { describe, expect, it } from 'vitest';
import {
	consumeListScroll,
	consumeNavDirection,
	consumeSkipTransition,
	markBackNavigation,
	markSkipTransition,
	rememberListScroll
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
});
