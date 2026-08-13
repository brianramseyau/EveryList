const STORAGE_KEY = 'everylist:token';

/** Guards every localStorage access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser. */
function hasStorage(): boolean {
	return typeof window !== 'undefined';
}

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
