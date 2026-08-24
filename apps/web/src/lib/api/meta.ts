import type { MetaResponse } from '@everylist/shared';
import { apiGet } from './client';

/** Fetches `GET /api/v1/meta` — see PLAN.md §8. Routed through apiGet/apiBaseUrl
 * like every other API call, since a relative fetch resolves against the native
 * app's local WebView origin rather than the configured server. */
export function fetchMeta(): Promise<MetaResponse> {
	return apiGet<MetaResponse>('/api/v1/meta');
}
