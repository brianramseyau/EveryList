import type { CategoryDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { offlineCreate, offlineMutate } from '$lib/offline/sync-engine';

export function fetchCategories(listId: number): Promise<CategoryDto[]> {
	return apiGet(`/api/v1/lists/${listId}/categories`);
}

export async function createCategory(
	listId: number,
	input: { name: string; icon: string }
): Promise<CategoryDto> {
	return offlineCreate<CategoryDto>({
		entityType: 'category',
		table: (db) => db.categories,
		payload: { ...input, listId },
		buildOptimisticRow: (tempId) => ({
			id: tempId,
			listId,
			name: input.name,
			icon: input.icon,
			sortOrder: Date.now(),
			isDefault: false,
			createdAt: new Date().toISOString(),
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: String(tempId),
			_dirty: true
		}),
		request: () => apiPost<CategoryDto>(`/api/v1/lists/${listId}/categories`, input)
	});
}

/** Renaming/re-iconing a global default forks it into a list-scoped override — see PLAN.md §7.
 * Note: forking assigns a *new* server-side id, so an edit queued while offline against a
 * still-global-default category cannot be reconciled locally the same way as a plain update —
 * this is a known limitation of the offline path for that one edge case. */
export async function updateCategory(
	listId: number,
	categoryId: number,
	input: Partial<{ name: string; icon: string }>
): Promise<CategoryDto | void> {
	return offlineMutate<CategoryDto>({
		entityType: 'category',
		op: 'update',
		targetId: categoryId,
		payload: input,
		applyOptimistically: async (db) => {
			const existing = await db.categories.get(categoryId);
			if (!existing) return 0;
			await db.categories.put({ ...existing, ...input, _dirty: true });
			return existing.version;
		},
		onSuccess: async (db, result) => {
			if (result) await db.categories.update(categoryId, { ...result, _dirty: false });
		},
		request: () => apiPatch<CategoryDto>(`/api/v1/lists/${listId}/categories/${categoryId}`, input)
	});
}

export async function deleteCategory(listId: number, categoryId: number): Promise<void> {
	await offlineMutate<void>({
		entityType: 'category',
		op: 'delete',
		targetId: categoryId,
		payload: {},
		applyOptimistically: async (db) => {
			const existing = await db.categories.get(categoryId);
			if (!existing) return 0;
			await db.categories.put({ ...existing, deletedAt: new Date().toISOString(), _dirty: true });
			return existing.version;
		},
		onSuccess: async (db) => {
			await db.categories.update(categoryId, { _dirty: false });
		},
		request: () => apiDelete(`/api/v1/lists/${listId}/categories/${categoryId}`)
	});
}

/** `order` is the full desired list of category ids, in the new order. Bulk reorders touch
 * every row in one request and aren't queued individually — this stays online-only. */
export function reorderCategories(listId: number, order: number[]): Promise<CategoryDto[]> {
	return apiPatch(`/api/v1/lists/${listId}/categories/reorder`, { order });
}
