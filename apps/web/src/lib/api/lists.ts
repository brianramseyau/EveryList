import type { ListDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchLists(): Promise<ListDto[]> {
	return apiGet('/api/v1/lists');
}

export function fetchList(id: number): Promise<ListDto> {
	return apiGet(`/api/v1/lists/${id}`);
}

export function createList(input: { name: string; color?: string; icon?: string | null }) {
	return apiPost<ListDto>('/api/v1/lists', input);
}

export function updateList(
	id: number,
	input: Partial<{
		name: string;
		color: string;
		icon: string | null;
		archived: boolean;
		badgeExcluded: boolean;
		folderId: number | null;
	}>
) {
	return apiPatch<ListDto>(`/api/v1/lists/${id}`, input);
}

export function deleteList(id: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${id}`);
}
