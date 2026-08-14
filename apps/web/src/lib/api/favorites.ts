import type { FavoriteItemDto, ItemDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { offlineCreate, offlineMutate } from '$lib/offline/sync-engine';

export function fetchFavorites(listId: number): Promise<FavoriteItemDto[]> {
	return apiGet(`/api/v1/lists/${listId}/favorites`);
}

export async function createFavorite(
	listId: number,
	input: {
		name: string;
		defaultQuantity?: string | null;
	}
): Promise<FavoriteItemDto> {
	return offlineCreate<FavoriteItemDto>({
		entityType: 'favorite_item',
		table: (db) => db.favoriteItems,
		payload: { ...input, listId },
		url: `/api/v1/lists/${listId}/favorites`,
		buildOptimisticRow: (tempId) => ({
			id: tempId,
			listId,
			userId: 0,
			name: input.name,
			defaultCategoryId: null,
			defaultQuantity: input.defaultQuantity ?? null,
			createdAt: new Date().toISOString(),
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: String(tempId),
			_dirty: true
		}),
		request: () => apiPost<FavoriteItemDto>(`/api/v1/lists/${listId}/favorites`, input)
	});
}

export async function updateFavorite(
	listId: number,
	id: number,
	input: Partial<{ name: string; defaultQuantity: string | null }>
): Promise<FavoriteItemDto | void> {
	return offlineMutate<FavoriteItemDto>({
		entityType: 'favorite_item',
		op: 'update',
		targetId: id,
		payload: input,
		url: `/api/v1/lists/${listId}/favorites/${id}`,
		applyOptimistically: async (db) => {
			const existing = await db.favoriteItems.get(id);
			if (!existing) return 0;
			await db.favoriteItems.put({ ...existing, ...input, _dirty: true });
			return existing.version;
		},
		onSuccess: async (db, result) => {
			if (result) await db.favoriteItems.update(id, { ...result, _dirty: false });
		},
		request: () => apiPatch<FavoriteItemDto>(`/api/v1/lists/${listId}/favorites/${id}`, input)
	});
}

export async function deleteFavorite(listId: number, id: number): Promise<void> {
	await offlineMutate<void>({
		entityType: 'favorite_item',
		op: 'delete',
		targetId: id,
		payload: {},
		url: `/api/v1/lists/${listId}/favorites/${id}`,
		applyOptimistically: async (db) => {
			const existing = await db.favoriteItems.get(id);
			if (!existing) return 0;
			await db.favoriteItems.put({
				...existing,
				deletedAt: new Date().toISOString(),
				_dirty: true
			});
			return existing.version;
		},
		onSuccess: async (db) => {
			await db.favoriteItems.update(id, { _dirty: false });
		},
		request: () => apiDelete(`/api/v1/lists/${listId}/favorites/${id}`)
	});
}

/** Creates a new item from a favorite's defaults — requires the server round trip to know the
 * resulting item's id and sort order, so this stays online-only. */
export function addFavoriteToList(listId: number, favoriteId: number): Promise<ItemDto> {
	return apiPost(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`);
}
