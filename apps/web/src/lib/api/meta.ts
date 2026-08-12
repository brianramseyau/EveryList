import type { MetaResponse } from '@everylist/shared';

/** Fetches `GET /api/v1/meta` — see PLAN.md §8. Relative path: same origin in
 * production, proxied to the API dev server locally (see vite.config.ts). */
export async function fetchMeta(): Promise<MetaResponse> {
	const response = await fetch('/api/v1/meta');
	if (!response.ok) {
		throw new Error(`GET /api/v1/meta failed: ${response.status}`);
	}
	return (await response.json()) as MetaResponse;
}
