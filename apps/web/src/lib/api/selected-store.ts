import { getDb, type SelectedStoreSettings } from '$lib/offline/db';

/**
 * "Currently shopping at" is a local, per-device selection — never synced
 * to the server or other members (see PLAN.md §7/§9). Keyed per list so
 * different lists can remember different stores. Backed by Dexie's
 * `selectedStore` table (moved off localStorage in Phase 5 so it lives
 * alongside the rest of the offline cache — see PHASE5_PLAN.md §3) rather
 * than the sync queue, since it's never sent to the server.
 */
export async function getSelectedStoreSettings(listId: number): Promise<SelectedStoreSettings> {
	const db = getDb();
	if (!db) return { storeId: null, filter: 'store' };

	const row = await db.selectedStore.get(listId);
	return {
		storeId: row?.storeId ?? null,
		// Legacy rows persisted `includeUnassigned`; new rows persist `filter`.
		filter:
			row?.filter ??
			(row?.storeId != null && row.includeUnassigned ? 'storeAndUnassigned' : 'store')
	};
}

export async function setSelectedStoreSettings(
	listId: number,
	settings: SelectedStoreSettings
): Promise<void> {
	const db = getDb();
	if (!db) return;

	await db.selectedStore.put({ listId, ...settings });
}
