const STORAGE_KEY = 'everylist:serverUrl';

/** Guards every localStorage access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser. */
function hasStorage(): boolean {
	return typeof window !== 'undefined';
}

/** The user-configured server origin for the native build (PLAN_13_PHASE_NATIVE_APP_SHELL.md §1) — e.g.
 * `https://everylist.example.com`. Empty for the web/PWA build, which is always same-origin and
 * never needs one. Persisted (not baked in at build time) so one native binary works against
 * anyone's self-hosted instance, the same way Nextcloud/Audiobookshelf/Donetick clients do. */
export function getServerUrl(): string {
	if (!hasStorage()) return '';
	return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

/** Trims the input and strips a trailing slash, so callers can concatenate
 * `${getServerUrl()}${path}` (path always starting with `/`) without a double slash. */
export function setServerUrl(url: string): void {
	if (!hasStorage()) return;
	window.localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''));
}

export function clearServerUrl(): void {
	if (!hasStorage()) return;
	window.localStorage.removeItem(STORAGE_KEY);
}
