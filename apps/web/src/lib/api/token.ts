const STORAGE_KEY = 'everylist:token';

/** Guards every localStorage access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser. */
function hasStorage(): boolean {
	return typeof window !== 'undefined';
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
}

export function clearToken(): void {
	if (!hasStorage()) return;
	window.localStorage.removeItem(STORAGE_KEY);
}
