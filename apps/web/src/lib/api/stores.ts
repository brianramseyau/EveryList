import type { StoreDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface StoreCategoryOrderDto {
	id: number;
	storeId: number;
	categoryId: number;
	sortOrder: number;
}

export function fetchStores(listId: number): Promise<StoreDto[]> {
	return apiGet(`/api/v1/lists/${listId}/stores`);
}

/** Attaches an existing store (storeId) or creates + attaches a new one (name). */
export function attachStore(
	listId: number,
	input: { storeId: number } | { name: string; color?: string }
): Promise<StoreDto> {
	return apiPost(`/api/v1/lists/${listId}/stores`, input);
}

export function detachStore(listId: number, storeId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/stores/${storeId}`);
}

export function updateStore(
	storeId: number,
	input: Partial<{ name: string; color: string }>
): Promise<StoreDto> {
	return apiPatch(`/api/v1/stores/${storeId}`, input);
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
