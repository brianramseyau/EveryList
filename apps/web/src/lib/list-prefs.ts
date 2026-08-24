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
