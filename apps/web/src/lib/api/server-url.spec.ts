import { describe, expect, it } from 'vitest';
import { clearServerUrl, getServerUrl, setServerUrl } from './server-url';

// This runs in the "server" (node) project, which has no `window` — it
// exercises the SSR/prerendering guard. See server-url.svelte.spec.ts for
// the real-localStorage behavior in a browser.
describe('server-url (no window)', () => {
	it('getServerUrl returns an empty string without throwing', () => {
		expect(getServerUrl()).toBe('');
	});

	it('setServerUrl and clearServerUrl are no-ops without throwing', () => {
		expect(() => setServerUrl('https://example.com')).not.toThrow();
		expect(() => clearServerUrl()).not.toThrow();
	});
});
