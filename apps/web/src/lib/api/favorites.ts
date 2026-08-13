import type { FavoriteItemDto, ItemDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchFavorites(): Promise<FavoriteItemDto[]> {
	return apiGet('/api/v1/favorites');
}

export function createFavorite(input: {
	name: string;
	defaultQuantity?: string | null;
}): Promise<FavoriteItemDto> {
	return apiPost('/api/v1/favorites', input);
}

export function updateFavorite(
	id: number,
	input: Partial<{ name: string; defaultQuantity: string | null }>
): Promise<FavoriteItemDto> {
	return apiPatch(`/api/v1/favorites/${id}`, input);
}

export function deleteFavorite(id: number): Promise<void> {
	return apiDelete(`/api/v1/favorites/${id}`);
}

export function addFavoriteToList(favoriteId: number, listId: number): Promise<ItemDto> {
	return apiPost(`/api/v1/favorites/${favoriteId}/add-to-list/${listId}`);
}
