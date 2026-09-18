import type { SubItemDto } from '@everylist/shared';
/* v8 ignore start */
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { offlineCreate, offlineMutate } from '$lib/offline/sync-engine';
/* v8 ignore stop */

/** Rarely used directly — the list page gets every item's sub-tasks preloaded
 * on its `subItems` field from `fetchItems` — but kept for completeness and
 * for any caller that needs a single item's checklist on its own. */
export function fetchSubItems(listId: number, itemId: number): Promise<SubItemDto[]> {
	return apiGet<SubItemDto[]>(`/api/v1/lists/${listId}/items/${itemId}/subtasks`);
}

export async function createSubItem(
	listId: number,
	itemId: number,
	name: string
): Promise<SubItemDto> {
	return offlineCreate<SubItemDto>({
		entityType: 'sub_item',
		table: (database) => database.subItems,
		payload: { name },
		url: `/api/v1/lists/${listId}/items/${itemId}/subtasks`,
		buildOptimisticRow: (tempId) => ({
			id: tempId,
			itemId,
			name,
			checked: false,
			checkedAt: null,
			sortOrder: Date.now(),
			createdBy: 0,
			createdAt: new Date().toISOString(),
			updatedAt: null,
			version: 1,
			_localId: String(tempId),
			_dirty: true
		}),
		request: () => apiPost<SubItemDto>(`/api/v1/lists/${listId}/items/${itemId}/subtasks`, { name })
	});
}

export async function updateSubItem(
	listId: number,
	itemId: number,
	subtaskId: number,
	input: Partial<{ name: string; checked: boolean }>
): Promise<SubItemDto | void> {
	return offlineMutate<SubItemDto>({
		entityType: 'sub_item',
		op: 'update',
		targetId: subtaskId,
		payload: input,
		url: `/api/v1/lists/${listId}/items/${itemId}/subtasks/${subtaskId}`,
		applyOptimistically: async (db) => {
			const existing = await db.subItems.get(subtaskId);
			if (!existing) return 0;
			await db.subItems.put({
				...existing,
				...input,
				checkedAt:
					input.checked !== undefined
						? input.checked
							? new Date().toISOString()
							: null
						: existing.checkedAt,
				_dirty: true
			});
			return existing.version;
		},
		onSuccess: async (db, result) => {
			if (result) await db.subItems.update(subtaskId, { ...result, _dirty: false });
		},
		request: () =>
			apiPatch<SubItemDto>(`/api/v1/lists/${listId}/items/${itemId}/subtasks/${subtaskId}`, input)
	});
}

/** Repositions a sub-task within its parent's checklist. Not offline-queueable, same as
 * `moveItem`: a drag-to-reorder gesture needs a live connection to resolve neighbor rows anyway. */
export function moveSubItem(
	listId: number,
	itemId: number,
	subtaskId: number,
	previousSubItemId: number | null
): Promise<SubItemDto> {
	return apiPatch(`/api/v1/lists/${listId}/items/${itemId}/subtasks/${subtaskId}/move`, {
		previousSubItemId
	});
}

export async function deleteSubItem(
	listId: number,
	itemId: number,
	subtaskId: number
): Promise<void> {
	await offlineMutate<void>({
		entityType: 'sub_item',
		op: 'delete',
		targetId: subtaskId,
		payload: {},
		url: `/api/v1/lists/${listId}/items/${itemId}/subtasks/${subtaskId}`,
		applyOptimistically: async (db) => {
			const existing = await db.subItems.get(subtaskId);
			if (!existing) return 0;
			// Hard delete (no restore UI for sub-tasks) — removed from Dexie
			// immediately rather than flagged with a `deletedAt`, unlike items.
			await db.subItems.delete(subtaskId);
			return existing.version;
		},
		request: () => apiDelete(`/api/v1/lists/${listId}/items/${itemId}/subtasks/${subtaskId}`)
	});
}
