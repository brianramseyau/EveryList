import type { SetupRequest, SetupResponse, SetupStatusDto } from '@everylist/shared';
import { apiGet, apiPost } from './client';
import { setToken } from './token';

export function fetchSetupStatus(): Promise<SetupStatusDto> {
	return apiGet('/api/v1/setup/status');
}

export async function completeSetup(input: SetupRequest): Promise<SetupResponse> {
	const response = await apiPost<SetupResponse>('/api/v1/setup', input);
	setToken(response.token);
	return response;
}
