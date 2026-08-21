import { ApiError } from './client';

/**
 * Runs `request`; on a genuine network failure (anything other than an `ApiError` — that means
 * the server actually responded, e.g. 401/403/404, and must never be masked by stale cached data,
 * since a real 403 can mean the user was just removed from this list and `apiFetch` already calls
 * `clearToken()` on a 401) calls `fallback` instead. `sync-engine.ts`'s `offlineCreate`/
 * `offlineMutate` already draw this same `instanceof ApiError` distinction for the write path —
 * this mirrors it for reads. `fallback` returning `undefined` means "nothing cached at all," and
 * rethrows the original error; a collection-shaped fallback should return `[]` for "cached but
 * empty," never `undefined`, since that's a legitimate result, not a signal to rethrow.
 */
export async function withCacheFallback<T>(
	request: () => Promise<T>,
	fallback: () => Promise<T | undefined>
): Promise<T> {
	try {
		return await request();
	} catch (err) {
		if (err instanceof ApiError) throw err;
		const cached = await fallback();
		if (cached === undefined) throw err;
		return cached;
	}
}
