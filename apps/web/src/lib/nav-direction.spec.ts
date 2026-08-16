import { describe, expect, it } from 'vitest';
import {
	consumeNavDirection,
	consumeSkipTransition,
	markBackNavigation,
	markSkipTransition
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
});
