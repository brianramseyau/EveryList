/**
 * Most-recently-picked icons, per device — not synced (mirrors
 * `$lib/list-prefs.ts`'s reasoning: it's a local display convenience, not
 * data). Used to backfill the icon picker's default suggestions once a
 * category/list name's own aliased suggestions (see ./aliases.ts) run out.
 */

const STORAGE_KEY = 'everylist:iconFavorites';
const MAX_TRACKED = 16;

function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function readFavorites(): string[] {
	if (!hasWindow()) return [];
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return stored ? stored.split(',').filter(Boolean) : [];
}

/** Call when the user picks an icon — moves it to the front of the
 * most-recently-used list, trimming the tail so it can't grow unbounded. */
export function recordIconUse(name: string): void {
	if (!hasWindow()) return;
	const existing = readFavorites().filter((icon) => icon !== name);
	const updated = [name, ...existing].slice(0, MAX_TRACKED);
	window.localStorage.setItem(STORAGE_KEY, updated.join(','));
}

/** Most-recently-picked icons first. */
export function getFavoriteIcons(): string[] {
	return readFavorites();
}
