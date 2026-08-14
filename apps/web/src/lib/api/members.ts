import type { ListMemberDto, ListRole } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch } from './client';

export function fetchMembers(listId: number): Promise<ListMemberDto[]> {
	return apiGet(`/api/v1/lists/${listId}/members`);
}

export function updateMemberRole(
	listId: number,
	memberId: number,
	role: Exclude<ListRole, 'owner'>
): Promise<ListMemberDto> {
	return apiPatch(`/api/v1/lists/${listId}/members/${memberId}`, { role });
}

export function removeMember(listId: number, memberId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/members/${memberId}`);
}
