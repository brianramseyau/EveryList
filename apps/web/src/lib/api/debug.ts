import type { DebugResponse } from '@everylist/shared';
import { apiGet } from './client';

/** Fetches `GET /api/v1/debug` — restricted server-side to user id 1 (see debug_controller.ts),
 * so any other account gets an ApiError with a 403 status. */
export function fetchDebugInfo(): Promise<DebugResponse> {
	return apiGet<DebugResponse>('/api/v1/debug');
}
