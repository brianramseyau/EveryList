import { afterEach, describe, expect, it } from 'vitest';
import {
	consumeListScroll,
	getRememberListScrollPreference,
	rememberListScroll,
	setRememberListScrollPreference
} from './nav-direction';

// Runs in the "client" (real Chromium) project so `window.localStorage` is the genuine browser
// implementation — see nav-direction.spec.ts for the SSR/no-window guard and the rest of the
// module's pure logic.
describe('nav-direction (browser)', () => {
	afterEach(() => {
		window.localStorage.removeItem('everylist:rememberListScroll');
	});

	it('defaults to enabled when nothing is stored', () => {
		expect(getRememberListScrollPreference()).toBe(true);
	});

	it('setRememberListScrollPreference persists off, and getRememberListScrollPreference reflects it', () => {
		setRememberListScrollPreference(false);

		expect(window.localStorage.getItem('everylist:rememberListScroll')).toBe('off');
		expect(getRememberListScrollPreference()).toBe(false);
	});

	it('setRememberListScrollPreference persists on', () => {
		setRememberListScrollPreference(false);
		setRememberListScrollPreference(true);

		expect(window.localStorage.getItem('everylist:rememberListScroll')).toBe('on');
		expect(getRememberListScrollPreference()).toBe(true);
	});

	it('rememberListScroll is a no-op once the preference is turned off', () => {
		setRememberListScrollPreference(false);
		rememberListScroll(1, 400);

		expect(consumeListScroll(1)).toBeNull();
	});

	it('turning the preference off discards a scroll position already remembered this session', () => {
		rememberListScroll(1, 400);
		setRememberListScrollPreference(false);

		expect(consumeListScroll(1)).toBeNull();
	});

	it('remembers again once the preference is turned back on', () => {
		setRememberListScrollPreference(false);
		setRememberListScrollPreference(true);
		rememberListScroll(1, 400);

		expect(consumeListScroll(1)).toBe(400);
	});
});
