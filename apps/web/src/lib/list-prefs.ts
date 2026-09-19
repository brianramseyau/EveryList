/**
 * Per-list, per-device display preferences — local only, not synced via the
 * API. Persists across sessions (unlike `$lib/passcode.ts`'s unlock state)
 * since it's just a display toggle, not an access gate.
 */

const SHOW_CHECKED_PREFIX = 'everylist:showChecked:';

function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

/** Defaults to `true` (show checked items) when nothing has been stored yet. */
export function getShowChecked(listId: number): boolean {
	if (!hasWindow()) return true;
	return window.localStorage.getItem(SHOW_CHECKED_PREFIX + listId) !== '0';
}

export function setShowChecked(listId: number, showChecked: boolean): void {
	if (!hasWindow()) return;
	window.localStorage.setItem(SHOW_CHECKED_PREFIX + listId, showChecked ? '1' : '0');
}

const EXPANDED_SUBTASKS_PREFIX = 'everylist:expandedSubtasks:';

/** Which items (by id) have their sub-tasks panel left expanded on this list, on
 * this device. Defaults to none expanded when nothing has been stored yet. */
export function getExpandedSubtaskIds(listId: number): number[] {
	if (!hasWindow()) return [];
	try {
		const raw = window.localStorage.getItem(EXPANDED_SUBTASKS_PREFIX + listId);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
	} catch {
		return [];
	}
}

export function setExpandedSubtaskIds(listId: number, ids: number[]): void {
	if (!hasWindow()) return;
	try {
		window.localStorage.setItem(EXPANDED_SUBTASKS_PREFIX + listId, JSON.stringify(ids));
	} catch {
		// Storage full/unavailable (e.g. private browsing) — expand state just won't persist this time.
	}
}
