import { toDisplayLabel } from './mdi';
import { getIconKeywords } from './aliases';

/** Display label plus any alias keywords, lowercased — searching this one
 * string is what lets a query like "milk" find an icon named "cup" (see
 * ./aliases.ts) using exactly the same scoring as a literal name match. */
function searchText(name: string): string {
	return [toDisplayLabel(name), ...getIconKeywords(name)].join(' ').toLowerCase();
}

/** Subsequence match: every character of `needle` must appear in `haystack`
 * in order (not necessarily contiguous), so a typo or a missed letter still
 * finds the icon. Contiguous runs score higher than scattered ones, so
 * "chse" ranks "cheese" above an icon that only happens to contain the same
 * four letters spread across unrelated words. Returns 0 when `needle` isn't
 * a subsequence of `haystack` at all. */
function fuzzyScore(haystack: string, needle: string): number {
	let searchFrom = 0;
	let score = 0;
	let streak = 0;
	for (const char of needle) {
		const index = haystack.indexOf(char, searchFrom);
		if (index === -1) return 0;
		streak = index === searchFrom ? streak + 1 : 1;
		score += streak;
		searchFrom = index + 1;
	}
	return score;
}

function scoreMatch(text: string, needle: string): number {
	if (text === needle) return 1000;
	if (text.startsWith(needle)) return 800;
	if (text.split(' ').some((word) => word.startsWith(needle))) return 600;
	if (text.includes(needle)) return 400;
	// A 1-2 character needle is a subsequence of almost any label (e.g. "ar"
	// inside "camera"), which would make fuzzy matching act as a no-op
	// filter — restrict it to queries specific enough for a near-miss match
	// to actually mean something.
	if (needle.length < 3) return 0;
	return fuzzyScore(text, needle);
}

/** Ranks `names` against `query`, highest-relevance first. Combines exact,
 * prefix, word-prefix, substring, alias (via `searchText`), and fuzzy
 * subsequence matching into one score so results degrade gracefully instead
 * of just going empty when nothing matches literally. */
export function searchIcons(names: string[], query: string): string[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [];

	const scored: { name: string; score: number }[] = [];
	for (const name of names) {
		const score = scoreMatch(searchText(name), needle);
		if (score > 0) scored.push({ name, score });
	}

	scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
	return scored.map((entry) => entry.name);
}
