import { hintedIcons } from './aliases';

// Shown before the user types a search (and once a name-based hint runs out
// of matches) — a handful of icons relevant to a shopping list app,
// verified to exist in @mdi/js.
export const DEFAULT_ICONS = [
	'cart',
	'basket',
	'foodApple',
	'breadSlice',
	'cheese',
	'carrot',
	'foodDrumstick',
	'fish',
	'egg',
	'coffee',
	'bottleSoda',
	'snowflake'
];

export interface SuggestedIconsResult {
	icons: string[];
	/** Whether any of `icons` came from the hint (e.g. category name) rather
	 * than favorites/defaults — lets the caller label the section. */
	fromHint: boolean;
}

/** Default icons to show before a search: icons aliased to `hint` (e.g. the
 * category/list name being typed) first, backfilled with the user's
 * most-recently-picked icons, then the general shopping defaults — deduped
 * and capped at `limit`. */
export function suggestedIcons(params: {
	names: string[];
	hint: string;
	favorites: string[];
	limit?: number;
}): SuggestedIconsResult {
	const { names, hint, favorites, limit = 24 } = params;
	const nameSet = new Set(names);
	const seen = new Set<string>();
	const icons: string[] = [];

	const add = (icon: string) => {
		if (seen.has(icon) || !nameSet.has(icon)) return;
		seen.add(icon);
		icons.push(icon);
	};

	for (const icon of hintedIcons(hint)) add(icon);
	const fromHint = icons.length > 0;

	for (const icon of favorites) add(icon);
	for (const icon of DEFAULT_ICONS) add(icon);

	return { icons: icons.slice(0, limit), fromHint };
}
