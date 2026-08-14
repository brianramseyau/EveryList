import type { FavoriteItemDto, ItemDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchFavorites(listId: number): Promise<FavoriteItemDto[]> {
	return apiGet(`/api/v1/lists/${listId}/favorites`);
}

export function createFavorite(
	listId: number,
	input: {
		name: string;
		defaultQuantity?: string | null;
	}
): Promise<FavoriteItemDto> {
	return apiPost(`/api/v1/lists/${listId}/favorites`, input);
}

export function updateFavorite(
	listId: number,
	id: number,
	input: Partial<{ name: string; defaultQuantity: string | null }>
): Promise<FavoriteItemDto> {
	return apiPatch(`/api/v1/lists/${listId}/favorites/${id}`, input);
}

export function deleteFavorite(listId: number, id: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/favorites/${id}`);
}

export function addFavoriteToList(listId: number, favoriteId: number): Promise<ItemDto> {
	return apiPost(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`);
}
