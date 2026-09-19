import type { SubItemDto } from '@everylist/shared';
/* v8 ignore start */
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { getDb, removeCachedSubItem } from '$lib/offline/db';
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
		// `listId` is queue bookkeeping (not sent to the server as the URL already has it): it lets
		// the list page's realtime handler recognize this client's own in-flight create via
		// `hasPendingCreateForList` and skip the redundant reload of its own broadcast.
		payload: { name, listId },
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
		deleteIfDiscarded: true,
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
	// A sub-task created offline that hasn't flushed yet only exists locally (negative temp id) —
	// there's nothing on the server to delete *yet*, so tombstone the local row (hiding it) and leave the queued
	// create alone: whichever path lands the create (`offlineCreate` when it's already in flight, the flush
	// loop's `replay` otherwise) notices the temp row is gone and queues a delete for the server's
	// copy. Cancelling the create here instead would lose
	// the delete whenever its POST was already in flight.
	if (subtaskId < 0) {
		await getDb()?.subItems.update(subtaskId, { _dirty: false, _discarded: true });
		return;
	}

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
		onSuccess: async (db) => {
			await removeCachedSubItem(db, itemId, subtaskId);
		},
		request: () => apiDelete(`/api/v1/lists/${listId}/items/${itemId}/subtasks/${subtaskId}`)
	});
}
