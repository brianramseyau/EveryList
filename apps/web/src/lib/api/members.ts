import type { ListMemberDto, ListRole, MemberCandidateDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchMembers(listId: number): Promise<ListMemberDto[]> {
	return apiGet(`/api/v1/lists/${listId}/members`);
}

/** People the current user already shares another list with, who aren't members of this list yet. */
export function fetchMemberCandidates(listId: number): Promise<MemberCandidateDto[]> {
	return apiGet(`/api/v1/lists/${listId}/members/candidates`);
}

export function addMember(
	listId: number,
	userId: number,
	role: Exclude<ListRole, 'owner'>
): Promise<ListMemberDto> {
	return apiPost(`/api/v1/lists/${listId}/members`, { userId, role });
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
