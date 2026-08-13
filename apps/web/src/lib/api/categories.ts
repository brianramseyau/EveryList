import type { CategoryDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export function fetchCategories(listId: number): Promise<CategoryDto[]> {
	return apiGet(`/api/v1/lists/${listId}/categories`);
}

export function createCategory(
	listId: number,
	input: { name: string; icon: string }
): Promise<CategoryDto> {
	return apiPost(`/api/v1/lists/${listId}/categories`, input);
}

/** Renaming/re-iconing a global default forks it into a list-scoped override — see PLAN.md §7. */
export function updateCategory(
	listId: number,
	categoryId: number,
	input: Partial<{ name: string; icon: string }>
): Promise<CategoryDto> {
	return apiPatch(`/api/v1/lists/${listId}/categories/${categoryId}`, input);
}

export function deleteCategory(listId: number, categoryId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/categories/${categoryId}`);
}

/** `order` is the full desired list of category ids, in the new order. */
export function reorderCategories(listId: number, order: number[]): Promise<CategoryDto[]> {
	return apiPatch(`/api/v1/lists/${listId}/categories/reorder`, { order });
}
