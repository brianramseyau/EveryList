import { afterEach, describe, expect, it } from 'vitest';
import { isListUnlocked, unlockList } from './passcode';

// Runs in the "client" (real Chromium) project so `window.sessionStorage`
// is the genuine browser implementation — see passcode.spec.ts for the
// hashing logic and the SSR/no-window guard.
describe('passcode (browser)', () => {
	afterEach(() => {
		window.sessionStorage.clear();
	});

	it('a list with no unlock recorded is locked', () => {
		expect(isListUnlocked(7)).toBe(false);
	});

	it('unlockList marks that exact list unlocked for this session, not others', () => {
		unlockList(7);
		expect(isListUnlocked(7)).toBe(true);
		expect(isListUnlocked(8)).toBe(false);
	});
});
