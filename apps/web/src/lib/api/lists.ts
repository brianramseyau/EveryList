import type { ListDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchLists(): Promise<ListDto[]> {
	return apiGet('/api/v1/lists');
}

export function fetchList(id: number): Promise<ListDto> {
	return apiGet(`/api/v1/lists/${id}`);
}

export function createList(input: {
	name: string;
	color?: string;
	icon?: string | null;
	useCategories?: boolean;
}) {
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
		useCategories: boolean;
		folderId: number | null;
		passcodeHash: string | null;
	}>
) {
	return apiPatch<ListDto>(`/api/v1/lists/${id}`, input);
}

export function deleteList(id: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${id}`);
}

export function emailExportList(id: number, email: string): Promise<void> {
	return apiPost<void>(`/api/v1/lists/${id}/export/email`, { email });
}
