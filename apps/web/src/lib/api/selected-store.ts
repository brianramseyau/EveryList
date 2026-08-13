/**
 * "Currently shopping at" is a local, per-device selection — never synced
 * to the server or other members (see PLAN.md §7/§9). Keyed per list so
 * different lists can remember different stores.
 */
function storageKey(listId: number): string {
	return `everylist:selected-store:${listId}`;
}

function hasStorage(): boolean {
	return typeof window !== 'undefined';
}

export function getSelectedStore(listId: number): number | null {
	if (!hasStorage()) return null;
	const raw = window.localStorage.getItem(storageKey(listId));
	return raw ? Number(raw) : null;
}

export function setSelectedStore(listId: number, storeId: number | null): void {
	if (!hasStorage()) return;
	if (storeId === null) {
		window.localStorage.removeItem(storageKey(listId));
	} else {
		window.localStorage.setItem(storageKey(listId), String(storeId));
	}
}
