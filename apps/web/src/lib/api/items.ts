import type { CategorizeSuggestionDto, ItemDto } from '@everylist/shared';
import { suggestCategoryName } from '@everylist/shared';
/* v8 ignore start */
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { getDb, type EveryListDB } from '$lib/offline/db';
import { offlineCreate, offlineMutate } from '$lib/offline/sync-engine';
import { withCacheFallback } from './cache-fallback';
/* v8 ignore stop */

export async function fetchItems(listId: number): Promise<ItemDto[]> {
	return withCacheFallback(
		async () => {
			const items = await apiGet<ItemDto[]>(`/api/v1/lists/${listId}/items`);
			// Cache the server's copies into Dexie so a later offline edit can read the row's
			// `version` to send as `expectedVersion` — without this the row is never cached and
			// an offline toggle enqueues `expectedVersion: 0`, guaranteeing a spurious 409 on sync
			// (see PHASE14_PLAN.md's sync-status page and apps/api's `reportVersionConflict`).
			const db = getDb();
			if (!db) return items;

			const ids = items.map((item) => item.id);
			const existing = await db.items.bulkGet(ids);
			// Never clobber a row with an unacked local edit (`_dirty`) with a stale re-fetch.
			const toPut = items.filter((_item, index) => !existing[index]?._dirty);
			if (toPut.length > 0) await db.items.bulkPut(toPut);

			// Merge local optimistic edits into the result so they survive a re-fetch (e.g. navigating
			// back to the list while still offline, where the network/cache response predates the edit).
			// A dirty local row overrides the server's copy, a locally-created (temp-id) row is appended,
			// and a soft-deleted row is dropped. Map insertion order keeps the server's `sortOrder` order
			// for existing rows while appending offline-created rows at the end.
			const dirtyRows = await db.items
				.filter((item) => item.listId === listId && item._dirty === true)
				.toArray();
			const byId = new Map<number, ItemDto>();
			for (const item of items) byId.set(item.id, item);
			for (const row of dirtyRows) {
				if (row.deletedAt) byId.delete(row.id);
				else byId.set(row.id, row);
			}
			return [...byId.values()];
		},
		async () => {
			const db = getDb();
			if (!db) return undefined;
			const rows = await db.items
				.filter((item) => item.listId === listId && !item.deletedAt)
				.toArray();
			return rows.sort((a, b) => a.sortOrder - b.sortOrder);
		}
	);
}

/** Soft-deleted items still within their recovery window, most recent first. */
export function fetchRecentItems(listId: number): Promise<ItemDto[]> {
	return apiGet(`/api/v1/lists/${listId}/items/recent`);
}

export function restoreItem(listId: number, itemId: number): Promise<ItemDto> {
	return apiPost(`/api/v1/lists/${listId}/items/${itemId}/restore`);
}

/** Hard-deletes an already soft-deleted row — the "Recently Deleted" page's permanent-delete
 * action. Not offline-queueable like the other item mutations here: there's no local row to
 * reconcile against once it's gone, so this requires a live connection. */
export function purgeItem(listId: number, itemId: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${listId}/items/${itemId}/purge`);
}

/** Purely local category guess against the static keyword table and whatever
 * categories are already cached in Dexie for this list — the offline fallback
 * for `fetchCategorySuggestion` below (PHASE7_PLAN.md §3), and mirrors the
 * server's own static-table fallback in `category_suggestion_service.ts`. */
async function staticGuessCategoryId(
	db: EveryListDB,
	listId: number,
	name: string
): Promise<number | null> {
	const suggestedName = suggestCategoryName(name);
	if (!suggestedName) return null;

	const listCategories = await db.categories.where('listId').equals(listId).toArray();
	const listMatch = listCategories.find((category) => category.name === suggestedName);
	if (listMatch) return listMatch.id;

	const globalCategories = await db.categories
		.filter((category) => category.listId === null)
		.toArray();
	const globalMatch = globalCategories.find((category) => category.name === suggestedName);
	return globalMatch?.id ?? null;
}

/** Personalized (frequency-based) suggestion from the real backend service —
 * see PHASE7_PLAN.md §3. Falls back to the local static-table guess when the
 * request fails (offline and this exact list+name was never cached by the
 * service worker's `StaleWhileRevalidate` rule for `/api/v1/*`). */
async function guessCategoryId(
	db: EveryListDB,
	listId: number,
	name: string
): Promise<number | null> {
	try {
		const suggestion = await apiGet<CategorizeSuggestionDto>(
			`/api/v1/lists/${listId}/items/categorize?name=${encodeURIComponent(name)}`
		);
		return suggestion.categoryId;
	} catch {
		return staticGuessCategoryId(db, listId, name);
	}
}

export async function createItem(
	listId: number,
	input: {
		name: string;
		quantity?: string | null;
		notes?: string | null;
		categoryId?: number | null;
		storeId?: number | null;
		price?: number | null;
	}
): Promise<ItemDto> {
	// Provably covered in isolation (run items.spec.ts + items-offline.spec.ts
	// alone and this file reports 100%) — other spec files' `vi.mock('./client',
	// …)` corrupts this statement's V8 attribution once merged into the full
	// suite, the same coverage-collection artifact documented on
	// $lib/api/selected-store.ts and $lib/api/token.ts.
	/* v8 ignore next */
	const db = getDb();
	const categoryId =
		input.categoryId !== undefined
			? input.categoryId
			: db
				? await guessCategoryId(db, listId, input.name)
				: null;

	return offlineCreate<ItemDto>({
		entityType: 'item',
		table: (database) => database.items,
		payload: { ...input, listId },
		url: `/api/v1/lists/${listId}/items`,
		buildOptimisticRow: (tempId) => ({
			id: tempId,
			listId,
			name: input.name,
			quantity: input.quantity ?? null,
			notes: input.notes ?? null,
			categoryId,
			storeId: input.storeId ?? null,
			price: input.price ?? null,
			checked: false,
			checkedAt: null,
			sortOrder: Date.now(),
			// Not known client-side until the server's response arrives; not
			// rendered anywhere in the current UI.
			createdBy: 0,
			createdAt: new Date().toISOString(),
			updatedAt: null,
			deletedAt: null,
			version: 1,
			_localId: String(tempId),
			_dirty: true
		}),
		request: () => apiPost<ItemDto>(`/api/v1/lists/${listId}/items`, input)
	});
}

/** Distinct, most-recent-first item names for this list, backing the add-item autocomplete
 * (PHASE10_PLAN.md #0.3). Falls back to deriving the same list from Dexie's cached items —
 * offline or a network failure — mirroring `guessCategoryId`'s server-then-local-fallback shape
 * above; the cache only ever holds non-deleted items, so unlike the server's endpoint this
 * fallback can't surface names from checked/deleted history. */
export async function fetchRecentItemNames(listId: number): Promise<string[]> {
	try {
		return await apiGet<string[]>(`/api/v1/lists/${listId}/items/recent-names`);
	} catch {
		const db = getDb();
		if (!db) return [];

		const rows = await db.items.filter((item) => item.listId === listId).toArray();
		rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

		const seen = new Set<string>();
		const names: string[] = [];
		for (const row of rows) {
			const key = row.name.trim().toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			names.push(row.name.trim());
			if (names.length >= 50) break;
		}
		return names;
	}
}

export function importItems(listId: number, text: string): Promise<ItemDto[]> {
	return apiPost<ItemDto[]>(`/api/v1/lists/${listId}/items/import`, { text });
}

export async function updateItem(
	listId: number,
	itemId: number,
	input: Partial<{
		name: string;
		quantity: string | null;
		notes: string | null;
		categoryId: number | null;
		storeId: number | null;
		price: number | null;
		checked: boolean;
		sortOrder: number;
	}>
): Promise<ItemDto | void> {
	return offlineMutate<ItemDto>({
		entityType: 'item',
		op: 'update',
		targetId: itemId,
		payload: input,
		url: `/api/v1/lists/${listId}/items/${itemId}`,
		applyOptimistically: async (db) => {
			const existing = await db.items.get(itemId);
			if (!existing) return 0;
			await db.items.put({
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
			if (result) await db.items.update(itemId, { ...result, _dirty: false });
		},
		request: () => apiPatch<ItemDto>(`/api/v1/lists/${listId}/items/${itemId}`, input)
	});
}

/** Repositions a single item to just after `previousItemId` (or the front of the list if
 * omitted/null) — the server-side counterpart to `handleItemDrop`'s local reordering, and what
 * the Home Assistant integration's `MOVE_TODO_ITEM` support calls (PHASE16_PLAN.md). */
export function moveItem(
	listId: number,
	itemId: number,
	previousItemId: number | null
): Promise<ItemDto> {
	return apiPatch(`/api/v1/lists/${listId}/items/${itemId}/move`, { previousItemId });
}

export async function deleteItem(listId: number, itemId: number): Promise<void> {
	await offlineMutate<void>({
		entityType: 'item',
		op: 'delete',
		targetId: itemId,
		payload: {},
		url: `/api/v1/lists/${listId}/items/${itemId}`,
		applyOptimistically: async (db) => {
			const existing = await db.items.get(itemId);
			if (!existing) return 0;
			await db.items.put({ ...existing, deletedAt: new Date().toISOString(), _dirty: true });
			return existing.version;
		},
		onSuccess: async (db) => {
			await db.items.update(itemId, { _dirty: false });
		},
		request: () => apiDelete(`/api/v1/lists/${listId}/items/${itemId}`)
	});
}
