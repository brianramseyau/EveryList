import { afterEach, describe, expect, it } from 'vitest';
import { clearToken, getToken, setToken } from './token';

// Runs in the "client" (real Chromium) project so `window.localStorage` is
// the genuine browser implementation, not a jsdom-less no-op — see
// token.spec.ts for the SSR/no-window guard.
describe('token (browser)', () => {
	afterEach(() => {
		clearToken();
	});

	it('has no token by default', () => {
		expect(getToken()).toBeNull();
	});

	it('round-trips a token through localStorage', () => {
		setToken('abc123');
		expect(getToken()).toBe('abc123');
		expect(window.localStorage.getItem('everylist:token')).toBe('abc123');
	});

	it('clearToken removes it', () => {
		setToken('abc123');
		clearToken();
		expect(getToken()).toBeNull();
	});
});
