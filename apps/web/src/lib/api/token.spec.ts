import { describe, expect, it } from 'vitest';
import { clearToken, getToken, setToken } from './token';

// This runs in the "server" (node) project, which has no `window` — it
// exercises the SSR/prerendering guard. See token.svelte.spec.ts for the
// real-localStorage behavior in a browser.
describe('token (no window)', () => {
	it('getToken returns null without throwing', () => {
		expect(getToken()).toBeNull();
	});

	it('setToken and clearToken are no-ops without throwing', () => {
		expect(() => setToken('x')).not.toThrow();
		expect(() => clearToken()).not.toThrow();
	});
});
