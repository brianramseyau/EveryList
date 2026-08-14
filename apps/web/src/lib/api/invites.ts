import type { ListDto, ListInviteDto, ListInvitePreviewDto, ListRole } from '@everylist/shared';
import { apiDelete, apiGet, apiPost } from './client';

export function fetchInvites(listId: number): Promise<ListInviteDto[]> {
	return apiGet(`/api/v1/lists/${listId}/invites`);
}

export function createInvite(
	listId: number,
	role: Exclude<ListRole, 'owner'>
): Promise<ListInviteDto> {
	return apiPost(`/api/v1/lists/${listId}/invites`, { role });
}

export function revokeInvite(listId: number, inviteId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/invites/${inviteId}`);
}

/** Unauthenticated — used by the pre-login join page. */
export function fetchInvitePreview(token: string): Promise<ListInvitePreviewDto> {
	return apiGet(`/api/v1/invites/${token}`);
}

export function acceptInvite(token: string): Promise<ListDto> {
	return apiPost(`/api/v1/invites/${token}/accept`);
}
