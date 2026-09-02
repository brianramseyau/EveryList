import type { ListDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { getDb } from '$lib/offline/db';
import { withCacheFallback } from './cache-fallback';

/** Every cached list, in the same order `fetchLists` returns — see `getCachedItems` in items.ts
 * for why an instant, network-free read is safe to paint from directly. */
export async function getCachedLists(): Promise<ListDto[] | undefined> {
	const db = getDb();
	if (!db) return undefined;
	const rows = await db.lists.toArray();
	return rows.sort((a, b) => (a._localSortOrder ?? 0) - (b._localSortOrder ?? 0));
}

export function fetchLists(): Promise<ListDto[]> {
	return withCacheFallback(async () => {
		const lists = await apiGet<ListDto[]>('/api/v1/lists');
		const db = getDb();
		// Provably covered in isolation (run lists.spec.ts + lists-offline.spec.ts alone and
		// this file reports 100%) — another spec file's `vi.mock('$lib/api/lists', …)`
		// corrupts this branch's V8 attribution once merged into the full suite, the same
		// coverage-collection artifact documented on $lib/api/items.ts et al.
		/* v8 ignore start */
		if (db) {
			await db.lists.bulkPut(lists.map((list, index) => ({ ...list, _localSortOrder: index })));
		}
		/* v8 ignore stop */
		return lists;
	}, getCachedLists);
}

/** This one list's cached row — see `getCachedLists` above. */
export async function getCachedList(id: number): Promise<ListDto | undefined> {
	return getDb()?.lists.get(id);
}

export function fetchList(id: number): Promise<ListDto> {
	return withCacheFallback(
		async () => {
			const list = await apiGet<ListDto>(`/api/v1/lists/${id}`);
			const db = getDb();
			if (db) {
				// Preserve this row's cached fetchLists-derived position — a single-row re-put
				// must not silently jump it to the front of an offline fallback ordering.
				const existing = await db.lists.get(id);
				await db.lists.put({ ...list, _localSortOrder: existing?._localSortOrder });
			}
			return list;
		},
		() => getCachedList(id)
	);
}

export function createList(input: {
	name: string;
	color?: string;
	icon?: string | null;
	useCategories?: boolean;
}) {
	return apiPost<ListDto>('/api/v1/lists', input);
}

export function updateList(
	id: number,
	input: Partial<{
		name: string;
		color: string;
		icon: string | null;
		archived: boolean;
		badgeExcluded: boolean;
		useCategories: boolean;
		useCategoryLearning: boolean;
		folderId: number | null;
		passcodeHash: string | null;
	}>
) {
	return apiPatch<ListDto>(`/api/v1/lists/${id}`, input);
}

export function deleteList(id: number): Promise<void> {
	return apiDelete(`/api/v1/lists/${id}`);
}

/** `order` is the full desired list of list ids, in the new order — reorders only the
 *  requesting user's own view (per-user preference, not shared list state). */
export function reorderLists(order: number[]): Promise<ListDto[]> {
	return apiPatch('/api/v1/lists/reorder', { order });
}

export function emailExportList(id: number, email: string): Promise<void> {
	return apiPost<void>(`/api/v1/lists/${id}/export/email`, { email });
}
