import type { FolderDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchFolders(): Promise<FolderDto[]> {
	return apiGet('/api/v1/folders');
}

export function createFolder(input: { name: string; color?: string }): Promise<FolderDto> {
	return apiPost('/api/v1/folders', input);
}

export function updateFolder(
	id: number,
	input: Partial<{ name: string; color: string; sortOrder: number }>
): Promise<FolderDto> {
	return apiPatch(`/api/v1/folders/${id}`, input);
}

export function deleteFolder(id: number): Promise<void> {
	return apiDelete(`/api/v1/folders/${id}`);
}
