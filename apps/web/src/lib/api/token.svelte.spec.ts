import { afterEach, describe, expect, it } from 'vitest';
import { clearToken, getToken, setToken, syncTokenToServiceWorker } from './token';

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

	function readMirroredToken(): Promise<string | null> {
		return new Promise((resolve) => {
			const request = indexedDB.open('everylist-sw-auth', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('kv');
			request.onsuccess = () => {
				const db = request.result;
				const getRequest = db.transaction('kv', 'readonly').objectStore('kv').get('token');
				getRequest.onsuccess = () => {
					resolve(getRequest.result ?? null);
					db.close();
				};
			};
		});
	}

	// push-sw.js (a service worker, with no access to localStorage) reads the token from this
	// same IndexedDB store to authenticate its "Complete"/"Snooze" notification-action requests.
	it('mirrors the token into IndexedDB for the service worker to read', async () => {
		setToken('abc123');
		await expect.poll(() => readMirroredToken()).toBe('abc123');

		clearToken();
		await expect.poll(() => readMirroredToken()).toBeNull();
	});

	// A device that logged in before the service worker's "Complete"/"Snooze" actions shipped has
	// a real localStorage token but never went through setToken's mirroring — this is the
	// belt-and-suspenders app-startup catch-up for that device, simulated here by writing
	// localStorage directly rather than via setToken.
	it('syncTokenToServiceWorker mirrors an already-stored token on demand', async () => {
		window.localStorage.setItem('everylist:token', 'pre-existing-token');

		syncTokenToServiceWorker();

		await expect.poll(() => readMirroredToken()).toBe('pre-existing-token');
	});

	it('syncTokenToServiceWorker is a harmless no-op when logged out', async () => {
		syncTokenToServiceWorker();

		await expect.poll(() => readMirroredToken()).toBeNull();
	});
});
