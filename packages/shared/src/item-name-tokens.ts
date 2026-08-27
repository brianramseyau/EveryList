/**
 * Tokenization shared by the learned auto-categorizer (PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md) on
 * both the API (when teaching/querying the model) and the web client (its
 * offline fallback). Splits a free-text item name into a small set of
 * normalized "words" so that spelling variants and plurals collapse onto the
 * same token — "Apple"/"Apples" -> "apple", "Berries" -> "berry", "2% milk"
 * and "Milk 1 gal" both contain "milk". Not a full stemmer: the goal is
 * dedup, not linguistic correctness, so whatever mapping this applies is
 * self-consistent (the same name always yields the same tokens, which is all
 * the classifier needs).
 */

/**
 * Lowercase, Unicode-normalize (NFKD + strip combining marks, so "café" and
 * "cafe" collide), strip punctuation, and collapse whitespace. Digits are
 * kept here — `tokenizeItemName` drops tokens without a letter, so a pure
 * number never survives to become a token, but a mixed "2gal"-style token
 * keeps its digits.
 */
export function normalizeItemName(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

const HAS_LETTER = /[a-z]/

/**
 * Strips the common English plural suffixes so singular/plural forms share a
 * token. Ordered so the more specific suffixes win, and guarded so a word
 * like "apples" (which happens to end in "es") still reduces to "apple"
 * rather than "appl": "ies" only fires for consonant+y plurals, "es" only for
 * s/x/z/ch/sh/o stems, and a trailing "s" otherwise.
 */
function stripPlural(token: string): string {
	if (token.length > 3 && token.endsWith('ies')) {
		return `${token.slice(0, -3)}y`
	}
	if (token.length > 2 && token.endsWith('es')) {
		const stem = token.slice(0, -2)
		if (/(?:s|x|z|ch|sh|o)$/.test(stem)) return stem
	}
	if (token.length > 1 && token.endsWith('s') && !token.endsWith('ss')) {
		return token.slice(0, -1)
	}
	return token
}

/**
 * The token set for an item name: normalized, split on whitespace, with
 * tokens that contain no letters dropped and plurals stripped. Returns an
 * empty array for a blank name.
 */
export function tokenizeItemName(name: string): string[] {
	const normalized = normalizeItemName(name)
	if (!normalized) return []
	// De-duplicated so a name like "milk and milk" doesn't double-count a
	// single assignment when it's taught to the model.
	return [...new Set(
		normalized
			.split(' ')
			.filter((token) => HAS_LETTER.test(token))
			.map(stripPlural)
	)]
}
