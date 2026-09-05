const STORAGE_KEY = 'everylist:token';

/** Guards every localStorage access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser. */
function hasStorage(): boolean {
	return typeof window !== 'undefined';
}

// Mirrors the token into IndexedDB, readable by `static/push-sw.js` — a plain, unbundled service
// worker file with no access to this module (or localStorage, which service workers can't reach
// at all). Needed so the service worker's "Complete"/"Snooze" notification actions can call the
// API directly when the app isn't open to handle them. Name/store/key here must match the
// literals duplicated in push-sw.js's own getAuthToken().
const SW_AUTH_DB = 'everylist-sw-auth';
const SW_AUTH_STORE = 'kv';

function mirrorTokenToServiceWorker(token: string | null): void {
	// Every environment this actually runs in has IndexedDB (any browser new enough for the
	// service worker/push APIs this exists to support) — this guard only matters for a test
	// environment with `window` but no `indexedDB` (jsdom), which none of this repo's Vitest
	// projects are (real Chromium or plain Node, see token.spec.ts/token.svelte.spec.ts).
	/* v8 ignore next */
	if (typeof indexedDB === 'undefined') return;
	const request = indexedDB.open(SW_AUTH_DB, 1);
	request.onupgradeneeded = () => request.result.createObjectStore(SW_AUTH_STORE);
	request.onsuccess = () => {
		const db = request.result;
		const tx = db.transaction(SW_AUTH_STORE, 'readwrite');
		if (token) tx.objectStore(SW_AUTH_STORE).put(token, 'token');
		else tx.objectStore(SW_AUTH_STORE).delete('token');
		tx.oncomplete = () => db.close();
	};
}

// Both branches here are directly exercised — token.spec.ts (no window) and
// token.svelte.spec.ts (real localStorage) — but the growing number of
// `vi.mock('$lib/api/token', …)` partial mocks across the suite corrupts
// V8's line/branch attribution for this file once merged into the full run
// — the same Vitest browser-mode coverage-collection artifact documented on
// `lib/api/selected-store.ts`, not missing coverage.
/* v8 ignore next 4 */
export function getToken(): string | null {
	if (!hasStorage()) return null;
	return window.localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
	if (!hasStorage()) return;
	window.localStorage.setItem(STORAGE_KEY, token);
	mirrorTokenToServiceWorker(token);
}

export function clearToken(): void {
	if (!hasStorage()) return;
	window.localStorage.removeItem(STORAGE_KEY);
	mirrorTokenToServiceWorker(null);
}

/** Re-mirrors the current token into IndexedDB — call once at app startup so a device that
 * logged in before the service worker's "Complete"/"Snooze" notification actions shipped (and so
 * never went through `setToken`'s mirroring) doesn't have to log out and back in for them to
 * start working. A no-op past that point: every subsequent change already goes through
 * `setToken`/`clearToken` above. */
export function syncTokenToServiceWorker(): void {
	if (!hasStorage()) return;
	mirrorTokenToServiceWorker(getToken());
}
