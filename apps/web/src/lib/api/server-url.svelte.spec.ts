import { afterEach, describe, expect, it } from 'vitest';
import { clearServerUrl, getServerUrl, setServerUrl } from './server-url';

// Runs in the "client" (real Chromium) project so `window.localStorage` is
// the genuine browser implementation, not a jsdom-less no-op — see
// server-url.spec.ts for the SSR/no-window guard.
describe('server-url (browser)', () => {
	afterEach(() => {
		clearServerUrl();
	});

	it('is empty by default — same-origin, like the web/PWA build', () => {
		expect(getServerUrl()).toBe('');
	});

	it('round-trips a server URL through localStorage', () => {
		setServerUrl('https://everylist.example.com');
		expect(getServerUrl()).toBe('https://everylist.example.com');
		expect(window.localStorage.getItem('everylist:serverUrl')).toBe(
			'https://everylist.example.com'
		);
	});

	it('trims whitespace and strips a trailing slash', () => {
		setServerUrl('  https://everylist.example.com/  ');
		expect(getServerUrl()).toBe('https://everylist.example.com');
	});

	it('clearServerUrl removes it', () => {
		setServerUrl('https://everylist.example.com');
		clearServerUrl();
		expect(getServerUrl()).toBe('');
	});
});
