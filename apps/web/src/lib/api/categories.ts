import type { CategoryDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { offlineCreate, offlineMutate, offlineReorder } from '$lib/offline/sync-engine';
// `vi.mock('$lib/offline/db', …)` in the item-detail page spec corrupts this import's V8
// attribution once merged into the full suite (see $lib/offline/flush.ts and sync-queue.ts).
/* v8 ignore start */
import { getDb } from '$lib/offline/db';
import { withCacheFallback } from './cache-fallback';
/* v8 ignore stop */

export async function fetchCategories(listId: number): Promise<CategoryDto[]> {
	return withCacheFallback(
		async () => {
			const categories = await apiGet<CategoryDto[]>(`/api/v1/lists/${listId}/categories`);
			// Cache the server's copies into Dexie so a later offline edit can read the row's
			// `version` for its `expectedVersion` — see fetchItems in items.ts for the full rationale.
			const db = getDb();
			if (db) {
				const ids = categories.map((category) => category.id);
				const existing = await db.categories.bulkGet(ids);
				const toPut = categories.filter((_category, index) => !existing[index]?._dirty);
				if (toPut.length > 0) await db.categories.bulkPut(toPut);
			}
			return categories;
		},
		async () => {
			const db = getDb();
			if (!db) return undefined;
			const rows = await db.categories
				.filter((category) => category.listId === listId && !category.deletedAt)
				.toArray();
			return rows.sort((a, b) => a.sortOrder - b.sortOrder);
		}
	);
}

export async function createCategory(
	listId: number,
	input: { name: string; icon: string }
): Promise<CategoryDto> {
	return offlineCreate<CategoryDto>({
		entityType: 'category',
		table: (db) => db.categories,
		payload: { ...input, listId },
		url: `/api/v1/lists/${listId}/categories`,
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
		url: `/api/v1/lists/${listId}/categories/${categoryId}`,
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
		url: `/api/v1/lists/${listId}/categories/${categoryId}`,
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

/** `order` is the full desired list of category ids, in the new order (see PHASE13_PLAN.md §5). */
export function reorderCategories(listId: number, order: number[]): Promise<CategoryDto[]> {
	return offlineReorder<CategoryDto[]>({
		entityType: 'category',
		scopeId: listId,
		payload: { order },
		url: `/api/v1/lists/${listId}/categories/reorder`,
		// Mirrors the backend's own indexing (categories_controller.ts's `reorder`): each id's
		// position in `order` becomes its new `sortOrder`. Skips an id that isn't a cached local
		// row (deleted/never-fetched) the same way the backend skips one that doesn't resolve.
		applyOptimistically: async (db) => {
			const rows: CategoryDto[] = [];
			for (const [index, id] of order.entries()) {
				const existing = await db.categories.get(id);
				if (!existing) continue;
				const updated = { ...existing, sortOrder: index, _dirty: true };
				await db.categories.put(updated);
				rows.push(updated);
			}
			return rows;
		},
		onSuccess: async (db, result) => {
			await db.categories.bulkPut(result.map((row) => ({ ...row, _dirty: false })));
		},
		request: () => apiPatch(`/api/v1/lists/${listId}/categories/reorder`, { order })
	});
}

/** Copies categories from another list into this one. Skips any category whose name already
 * exists on the target, so it's safe to run twice. Online-only, like `importItems`. */
export function importCategories(
	listId: number,
	input: { sourceListId: number; categoryIds: number[] }
): Promise<CategoryDto[]> {
	return apiPost(`/api/v1/lists/${listId}/categories/import`, input);
}

/** Creates categories from a pasted list of names, one per line — the server matches each name to
 * a relatable icon (see the API's `category_bulk_import.ts`), same as bulk item import does for
 * AnyList category headers. Skips any name that already exists on this list. Online-only, like
 * `importItems`. */
export function bulkImportCategories(listId: number, text: string): Promise<CategoryDto[]> {
	return apiPost(`/api/v1/lists/${listId}/categories/bulk-import`, { text });
}
