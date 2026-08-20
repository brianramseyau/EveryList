/**
 * Liveness probe for the connectivity monitor (PHASE14_PLAN.md). Deliberately a
 * raw `fetch` (not the `apiFetch` wrapper) with `cache: 'no-store'`, and treated
 * as reachable only on a 2xx whose `Content-Type` is JSON — a reverse proxy can
 * answer for a downed container with an HTML placeholder/error page, which must
 * read as unreachable. `/api/v1/ping` is also excluded from the service worker's
 * runtime cache (see pwa.config.mjs) so no cached 200 can mask an outage.
 */
export async function fetchPing(): Promise<boolean> {
	try {
		const response = await fetch('/api/v1/ping', {
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
