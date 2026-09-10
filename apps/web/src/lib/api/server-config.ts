import type { ServerConfigStateDto, UpdateServerConfigPayload } from '@everylist/shared';
import { apiGet, apiPatch } from './client';

export function fetchServerConfig(): Promise<ServerConfigStateDto> {
	return apiGet('/api/v1/server-config');
}

export function updateServerConfig(
	patch: UpdateServerConfigPayload
): Promise<ServerConfigStateDto> {
	return apiPatch('/api/v1/server-config', patch);
}
