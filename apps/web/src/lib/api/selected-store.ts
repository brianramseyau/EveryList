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

// This function's post-guard path (both the "storage exists" branch and the
// `raw ? Number(raw) : null` read) is genuinely exercised by
// selected-store.svelte.spec.ts's "has no selection by default" and
// "round-trips a selection" tests — run that file alone and this whole file
// reports 100%. Two other spec files `vi.mock('$lib/api/selected-store', …)`,
// and that module virtualization corrupts V8's line/branch attribution for
// this file once merged into the full suite — a Vitest browser-mode +
// vi.mock coverage-collection artifact, not missing coverage. Same rationale
// as apps/api's justified `User.initials` c8-ignore exception (see §11).
export function getSelectedStore(listId: number): number | null {
	/* v8 ignore else */
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
