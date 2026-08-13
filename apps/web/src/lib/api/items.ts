import type { ItemDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchItems(listId: number): Promise<ItemDto[]> {
	return apiGet(`/api/v1/lists/${listId}/items`);
}

export function createItem(
	listId: number,
	input: {
		name: string;
		quantity?: string | null;
		notes?: string | null;
		categoryId?: number | null;
	}
) {
	return apiPost<ItemDto>(`/api/v1/lists/${listId}/items`, input);
}

export function importItems(listId: number, text: string): Promise<ItemDto[]> {
	return apiPost<ItemDto[]>(`/api/v1/lists/${listId}/items/import`, { text });
}

export function updateItem(
	listId: number,
	itemId: number,
	input: Partial<{
		name: string;
		quantity: string | null;
		notes: string | null;
		categoryId: number | null;
		checked: boolean;
	}>
) {
	return apiPatch<ItemDto>(`/api/v1/lists/${listId}/items/${itemId}`, input);
}

export function deleteItem(listId: number, itemId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/items/${itemId}`);
}
