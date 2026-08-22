import type { AccessTokenCreatedDto, AccessTokenDto, ListRole } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

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

/** Replaces a token's entire grant set — same shape as `createToken`, name optional. */
export function updateToken(
	tokenId: number,
	listIds: number[],
	role: Exclude<ListRole, 'owner'>,
	name?: string
): Promise<AccessTokenDto> {
	return apiPatch(`/api/v1/tokens/${tokenId}`, { name, listIds, role });
}

export function revokeToken(tokenId: number): Promise<void> {
	return apiDelete(`/api/v1/tokens/${tokenId}`);
}
