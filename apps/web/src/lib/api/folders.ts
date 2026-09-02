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
		/* v8 ignore next */
		if (db) await db.folders.bulkPut(folders);
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

export function deleteFolder(id: number): Promise<void> {
	return apiDelete(`/api/v1/folders/${id}`);
}

/** `order` is the full desired list of folder ids, in the new order — reorders every folder
 *  the requesting user owns, in one request. */
export function reorderFolders(order: number[]): Promise<FolderDto[]> {
	return apiPatch('/api/v1/folders/reorder', { order });
}
