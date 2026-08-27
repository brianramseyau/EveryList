export interface AutocompleteSuggestion {
	name: string;
	isFavorite: boolean;
}

/** Merges favorite names + recent item-name history into one deduped list, favorites first
 * (PLAN_10_PHASE_VALIDATION_USABILITY.md #0.3) — case-insensitive/trimmed dedup, keeping the favorite's own casing
 * when a name appears in both sources. */
export function mergeSuggestions(
	favoriteNames: string[],
	recentNames: string[]
): AutocompleteSuggestion[] {
	const seen = new Set<string>();
	const merged: AutocompleteSuggestion[] = [];

	for (const name of favoriteNames) {
		const key = name.trim().toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push({ name: name.trim(), isFavorite: true });
	}
	for (const name of recentNames) {
		const key = name.trim().toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push({ name: name.trim(), isFavorite: false });
	}

	return merged;
}

/** Substring-filters merged suggestions against the current input, capped at `limit` — an empty
 * query yields no suggestions rather than the full list, so the panel doesn't pop open before
 * the user has typed anything. */
export function filterSuggestions(
	suggestions: AutocompleteSuggestion[],
	query: string,
	limit = 20
): AutocompleteSuggestion[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [];
	return suggestions.filter((s) => s.name.toLowerCase().includes(needle)).slice(0, limit);
}
