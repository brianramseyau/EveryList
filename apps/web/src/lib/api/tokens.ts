import type { AccessTokenCreatedDto, AccessTokenDto, ListRole } from '@everylist/shared';
import { apiDelete, apiGet, apiPost } from './client';

export function fetchTokens(): Promise<AccessTokenDto[]> {
	return apiGet('/api/v1/tokens');
}

export function createToken(
	name: string,
	listIds: number[],
	role: Exclude<ListRole, 'owner'>
): Promise<AccessTokenCreatedDto> {
	return apiPost('/api/v1/tokens', { name, listIds, role });
}

export function revokeToken(tokenId: number): Promise<void> {
	return apiDelete(`/api/v1/tokens/${tokenId}`);
}
