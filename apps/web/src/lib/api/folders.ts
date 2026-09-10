import type { FolderDto } from '@everylist/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { getDb } from '$lib/offline/db';
import { withCacheFallback } from './cache-fallback';

/** Every cached folder — see `getCachedItems` in items.ts for why an instant, network-free read
 * is safe to paint from directly. */
export async function getCachedFolders(): Promise<FolderDto[] | undefined> {
	const db = getDb();
	if (!db) return undefined;
	const rows = await db.folders.toArray();
	return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function fetchFolders(): Promise<FolderDto[]> {
	return withCacheFallback(async () => {
		const folders = await apiGet<FolderDto[]>('/api/v1/folders');
		const db = getDb();
		// Provably covered in isolation (run folders.spec.ts + folders-offline.spec.ts alone
		// and this file reports 100%) — another spec file's `vi.mock('$lib/api/folders', …)`
		// corrupts this branch's V8 attribution once merged into the full suite, the same
		// coverage-collection artifact documented on $lib/api/items.ts et al.
		/* v8 ignore start */
		if (db) {
			await db.folders.bulkPut(folders);
			// Prune rows for folders no longer returned by the server (deleted) — otherwise a
			// stale cached row lingers in Dexie forever and flashes back in on every subsequent
			// cache-first paint, even though the in-memory result here is already correct.
			const ids = new Set(folders.map((folder) => folder.id));
			const staleIds = (await db.folders.toArray())
				.map((row) => row.id)
				.filter((id) => !ids.has(id));
			if (staleIds.length > 0) await db.folders.bulkDelete(staleIds);
		}
		/* v8 ignore stop */
		return folders;
	}, getCachedFolders);
}

export function createFolder(input: { name: string; color?: string }): Promise<FolderDto> {
	return apiPost('/api/v1/folders', input);
}

export function updateFolder(
	id: number,
	input: Partial<{ name: string; color: string; sortOrder: number }>
): Promise<FolderDto> {
	return apiPatch(`/api/v1/folders/${id}`, input);
}

export async function deleteFolder(id: number): Promise<void> {
	await apiDelete(`/api/v1/folders/${id}`);
	// Drop the cached row immediately rather than waiting for the next fetchFolders prune — the
	// caller repaints its folders list straight from local state before revalidating.
	// Best-effort: the server delete above already succeeded, so a local cache failure here
	// (blocked/closed IndexedDB, quota, another tab's version change) must not surface as a
	// failed delete — the next fetchFolders prune cleans it up regardless.
	try {
		await getDb()?.folders.delete(id);
	} catch {
		// Ignored — see comment above.
	}
}

/** `order` is the full desired list of folder ids, in the new order — reorders every folder
 *  the requesting user owns, in one request. */
export function reorderFolders(order: number[]): Promise<FolderDto[]> {
	return apiPatch('/api/v1/folders/reorder', { order });
}
