/**
 * Absolute origin to prefix every API/realtime request with — empty for same-origin
 * web/PWA/Docker builds (today's behavior, unchanged), or an absolute URL baked in at build time
 * for the Capacitor native build, whose WebView runs on a local scheme (`capacitor://localhost`)
 * rather than the real server. Shared by `client.ts` (HTTP) and `realtime.ts` (Transmit/SSE) so
 * both sides of the app agree on where "the server" is.
 *
 * Read lazily (not cached at module load) so tests can stub it per-case. Uses `import.meta.env
 * .VITE_API_BASE_URL` rather than SvelteKit's `$env/static/public` convention because the latter
 * throws a build error for a named import with no matching env var — unacceptable for a var that
 * must stay optional across dev/CI/Docker builds that never set it. Kept in its own module (rather
 * than living on `client.ts`) so importing it doesn't pull in `client.ts`'s other dependencies.
 */
export function apiBaseUrl(): string {
	return import.meta.env.VITE_API_BASE_URL ?? '';
}
