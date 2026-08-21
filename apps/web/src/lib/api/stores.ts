import type { StoreCategoryOrderDto, StoreDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { offlineCreate, offlineMutate, offlineReorder } from '$lib/offline/sync-engine';
// `vi.mock('$lib/offline/db', …)` in the item-detail page spec corrupts this import's V8
// attribution once merged into the full suite (see $lib/offline/flush.ts and sync-queue.ts).
/* v8 ignore start */
import { getDb } from '$lib/offline/db';
/* v8 ignore stop */

export type { StoreCategoryOrderDto };

export async function fetchStores(listId: number): Promise<StoreDto[]> {
	const stores = await apiGet<StoreDto[]>(`/api/v1/lists/${listId}/stores`);
	// Cache the server's copies into Dexie so a later offline edit can read the row's
	// `version` for its `expectedVersion` — see fetchItems in items.ts for the full rationale.
	const db = getDb();
	if (db) {
		const ids = stores.map((store) => store.id);
		const existing = await db.stores.bulkGet(ids);
		const toPut = stores.filter((_store, index) => !existing[index]?._dirty);
		if (toPut.length > 0) await db.stores.bulkPut(toPut);
	}
	return stores;
}

/** Attaches an existing store (storeId) or creates + attaches a new one (name). Attaching by id
 * is a join-table op with no versioned row of its own — the server computes the resulting row,
 * so (per PHASE13_PLAN.md §5) it gets the same offline treatment as a create, just queued as
 * `'attach'`: a best-effort placeholder (a copy of whatever this client already knows about that
 * store, if it's been fetched on another list before, or a generic placeholder otherwise) stands
 * in until the server's authoritative row replaces it on flush. */
export async function attachStore(
	listId: number,
	input: { storeId: number } | { name: string; color?: string }
): Promise<StoreDto> {
	if ('storeId' in input) {
		const db = getDb();
		const existing = db ? await db.stores.get(input.storeId) : undefined;
		return offlineCreate<StoreDto>({
			entityType: 'store',
			op: 'attach',
			table: (database) => database.stores,
			payload: input,
			url: `/api/v1/lists/${listId}/stores`,
			buildOptimisticRow: (tempId) => ({
				...(existing ?? {
					name: 'Store',
					color: '#3b82f6',
					createdBy: 0,
					createdAt: new Date().toISOString(),
					updatedAt: null,
					deletedAt: null,
					version: 1
				}),
				id: tempId,
				_localId: String(tempId),
				_dirty: true
			}),
			request: () => apiPost<StoreDto>(`/api/v1/lists/${listId}/stores`, input)
		});
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
	return offlineReorder<StoreCategoryOrderDto[]>({
		entityType: 'store_category_order',
		scopeId: storeId,
		payload: { categories: entries },
		url: `/api/v1/stores/${storeId}/categories`,
		applyOptimistically: async (db) => {
			const rows: StoreCategoryOrderDto[] = [];
			for (const entry of entries) {
				const existing = await db.storeCategoryOrders.get([storeId, entry.categoryId]);
				const updated = {
					id: existing?.id ?? 0,
					storeId,
					categoryId: entry.categoryId,
					sortOrder: entry.sortOrder,
					deletedAt: null,
					version: existing?.version ?? 1,
					_dirty: true
				};
				await db.storeCategoryOrders.put(updated);
				rows.push(updated);
			}
			return rows;
		},
		onSuccess: async (db, result) => {
			await db.storeCategoryOrders.bulkPut(result.map((row) => ({ ...row, _dirty: false })));
		},
		request: () => apiPatch(`/api/v1/stores/${storeId}/categories`, { categories: entries })
	});
}
