import type { StoreCategoryOrderDto, StoreDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { offlineCreate, offlineMutate } from '$lib/offline/sync-engine';

export type { StoreCategoryOrderDto };

export function fetchStores(listId: number): Promise<StoreDto[]> {
	return apiGet(`/api/v1/lists/${listId}/stores`);
}

/** Attaches an existing store (storeId) or creates + attaches a new one (name). Attaching an
 * existing store is a join-table op with no versioned row of its own, so only the create-a-new-
 * store path gets the offline treatment; attaching by id stays online-only. */
export async function attachStore(
	listId: number,
	input: { storeId: number } | { name: string; color?: string }
): Promise<StoreDto> {
	if ('storeId' in input) {
		return apiPost(`/api/v1/lists/${listId}/stores`, input);
	}
	return offlineCreate<StoreDto>({
		entityType: 'store',
		table: (db) => db.stores,
		payload: { ...input, listId },
		url: `/api/v1/lists/${listId}/stores`,
		buildOptimisticRow: (tempId) => ({
			id: tempId,
			name: input.name,
			color: input.color ?? '#3b82f6',
			createdBy: 0,
			createdAt: new Date().toISOString(),
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: String(tempId),
			_dirty: true
		}),
		request: () => apiPost<StoreDto>(`/api/v1/lists/${listId}/stores`, input)
	});
}

export function detachStore(listId: number, storeId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/stores/${storeId}`);
}

export async function updateStore(
	storeId: number,
	input: Partial<{ name: string; color: string }>
): Promise<StoreDto | void> {
	return offlineMutate<StoreDto>({
		entityType: 'store',
		op: 'update',
		targetId: storeId,
		payload: input,
		url: `/api/v1/stores/${storeId}`,
		applyOptimistically: async (db) => {
			const existing = await db.stores.get(storeId);
			if (!existing) return 0;
			await db.stores.put({ ...existing, ...input, _dirty: true });
			return existing.version;
		},
		onSuccess: async (db, result) => {
			if (result) await db.stores.update(storeId, { ...result, _dirty: false });
		},
		request: () => apiPatch<StoreDto>(`/api/v1/stores/${storeId}`, input)
	});
}

export function fetchStoreCategoryOrder(storeId: number): Promise<StoreCategoryOrderDto[]> {
	return apiGet(`/api/v1/stores/${storeId}/categories`);
}

export function reorderStoreCategories(
	storeId: number,
	entries: { categoryId: number; sortOrder: number }[]
): Promise<StoreCategoryOrderDto[]> {
	return apiPatch(`/api/v1/stores/${storeId}/categories`, { categories: entries });
}
