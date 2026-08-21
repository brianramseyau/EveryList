import { apiBaseUrl } from './base-url';

/**
 * Liveness probe for the connectivity monitor (PHASE14_PLAN.md). Deliberately a
 * raw `fetch` (not the `apiFetch` wrapper) with `cache: 'no-store'`, and treated
 * as reachable only on a 2xx whose `Content-Type` is JSON — a reverse proxy can
 * answer for a downed container with an HTML placeholder/error page, which must
 * read as unreachable. `/api/v1/ping` is also excluded from the service worker's
 * runtime cache (see pwa.config.mjs) so no cached 200 can mask an outage.
 *
 * `baseUrl` defaults to the currently-configured server (`apiBaseUrl()`) but can be overridden to
 * test a candidate URL before it's saved — see `/server-setup` (PHASE13_PLAN.md §1).
 *
 * Provably covered in isolation (run ping.spec.ts alone and this file reports 100%) — another spec
 * file's `vi.mock('$lib/api/ping', …)` (server-setup's page.svelte.spec.ts) corrupts V8's
 * default-parameter-branch attribution for this line once merged into the full suite, the same
 * coverage-collection artifact documented on `lib/api/selected-store.ts` and `lib/api/token.ts`.
 */
/* v8 ignore next */
export async function fetchPing(baseUrl: string = apiBaseUrl()): Promise<boolean> {
	try {
		const response = await fetch(`${baseUrl}/api/v1/ping`, {
			cache: 'no-store',
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) return false;
		const contentType = response.headers.get('content-type') ?? '';
		return contentType.includes('application/json');
	} catch {
		return false;
	}
}
