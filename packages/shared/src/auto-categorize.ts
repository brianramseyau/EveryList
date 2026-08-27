/**
 * Auto-categorization in two tiers, shared between the API (server-side
 * suggestion/learning) and the web client (offline fallback) so both sides
 * agree on a guess without a round trip — see PLAN_00_FOUNDATIONAL_PLAN.md §9.
 *
 * Tier 1 is the learned model: explicit user category assignments are stored
 * server-side in `category_learnings` (one row per list/token/category) and
 * ranked here via exponential half-life decay with a floor — see
 * PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md and apps/api's category_suggestion_service.ts. Tier 2 is
 * the static keyword table below, the fallback when the model has no
 * confident answer.
 *
 * NOTE: the category names in `KEYWORDS_BY_CATEGORY` must match a list's own
 * category names (seeded by apps/api's category_service.ts) for the fallback
 * to resolve — the static table maps a name to a category *name*, not an id.
 */
const KEYWORDS_BY_CATEGORY: Record<string, readonly string[]> = {
	Produce: [
		'apple',
		'banana',
		'orange',
		'grape',
		'lettuce',
		'spinach',
		'carrot',
		'onion',
		'potato',
		'tomato',
		'pepper',
		'cucumber',
		'broccoli',
		'avocado',
		'lemon',
		'lime',
		'berry',
		'berries',
		'mushroom',
		'garlic',
		'celery',
		'fruit',
		'vegetable',
		'kale',
		'melon',
	],
	Dairy: [
		'milk',
		'cheese',
		'yogurt',
		'yoghurt',
		'butter',
		'cream',
		'egg',
		'eggs',
		'sour cream',
		'cottage cheese',
	],
	Meat: [
		'chicken',
		'beef',
		'pork',
		'turkey',
		'bacon',
		'sausage',
		'steak',
		'ham',
		'ground beef',
		'fish',
		'salmon',
		'shrimp',
		'lamb',
	],
	Bakery: ['bread', 'bagel', 'bun', 'roll', 'muffin', 'croissant', 'tortilla', 'cake', 'donut'],
	Frozen: ['frozen', 'ice cream', 'popsicle', 'freezer'],
	Pantry: [
		'rice',
		'pasta',
		'cereal',
		'flour',
		'sugar',
		'oil',
		'sauce',
		'soup',
		'bean',
		'beans',
		'can',
		'canned',
		'snack',
		'chips',
		'cracker',
		'coffee',
		'tea',
		'spice',
		'salt',
		'pepper corn',
		'peanut butter',
		'jam',
		'honey',
		'cereal bar',
		'nuts',
	],
	Household: [
		'soap',
		'detergent',
		'paper towel',
		'toilet paper',
		'napkin',
		'trash bag',
		'cleaner',
		'sponge',
		'foil',
		'plastic wrap',
		'battery',
		'light bulb',
		'shampoo',
		'toothpaste',
		'deodorant',
	],
};

/**
 * Returns the best-matching default category name for the given item name,
 * or `null` when nothing matches (caller falls back to "Other" or leaves
 * the item uncategorized).
 */
export function suggestCategoryName(itemName: string): string | null {
	const normalized = itemName.trim().toLowerCase();
	if (!normalized) return null;

	let bestMatch: { category: string; keywordLength: number } | null = null;

	for (const [category, keywords] of Object.entries(KEYWORDS_BY_CATEGORY)) {
		for (const keyword of keywords) {
			if (normalized.includes(keyword) && (!bestMatch || keyword.length > bestMatch.keywordLength)) {
				bestMatch = { category, keywordLength: keyword.length };
			}
		}
	}

  return bestMatch?.category ?? null;
}

/**
 * Exponential half-life for a learned association's weight, in milliseconds
 * (180 days). A `count`-strength association's contribution to a category's
 * score is `count · max(FLOOR, 2^(-age / HALF_LIFE_MS))` — see
 * `rankCategoryLearnings` below.
 */
export const HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000;

/** The floor a decayed weight never falls below, so a long-dormant mapping still
 * categorizes (the "AnyList forgot my item" gap — an *uncontested* association
 * always wins regardless of decay). */
export const DECAY_FLOOR = 0.05;

/** How decisively the top category must beat the runner-up to be trusted when
 * more than one category matches — `best.score >= MARGIN * second.score`. */
export const MARGIN = 2;

/** A learned association's persisted shape (see apps/api's `category_learnings`
 * table). `lastSeenAt` is an ISO string on the wire (the `CategoryLearningDto`
 * in domain.ts) and an epoch-millisecond number when read back from the API's
 * Luxon model — this loose type accepts either so the same pure function ranks
 * both. */
export interface CategoryLearning {
  categoryId: number;
  token: string;
  count: number;
  lastSeenAt: number | string;
}

export interface RankedCategory {
  categoryId: number;
  score: number;
  /** The most recent `lastSeenAt` among the rows that contributed to `score`. */
  lastSeenAt: number;
}

function decayWeight(ageMs: number): number {
  const decayed = Math.pow(2, -ageMs / HALF_LIFE_MS);
  return Math.max(DECAY_FLOOR, decayed);
}

/**
 * Ranks categories by summed, decay-weighted count across every learning whose
 * token appears in `tokens`. Sorted by score descending, ties broken by most
 * recent `lastSeenAt`.
 */
export function rankCategoryLearnings(
  tokens: readonly string[],
  learnings: readonly CategoryLearning[],
  now: number
): RankedCategory[] {
  const tokenSet = new Set(tokens);
  const byCategory = new Map<number, { score: number; lastSeenAt: number }>();

  for (const learning of learnings) {
    if (!tokenSet.has(learning.token)) continue;

    const lastSeenAt =
      typeof learning.lastSeenAt === 'string'
        ? new Date(learning.lastSeenAt).getTime()
        : learning.lastSeenAt;

    const entry = byCategory.get(learning.categoryId);
    if (entry) {
      entry.score += learning.count * decayWeight(now - lastSeenAt);
      if (lastSeenAt > entry.lastSeenAt) entry.lastSeenAt = lastSeenAt;
    } else {
      byCategory.set(learning.categoryId, {
        score: learning.count * decayWeight(now - lastSeenAt),
        lastSeenAt,
      });
    }
  }

  return [...byCategory.entries()]
    .map(([categoryId, entry]) => ({ categoryId, score: entry.score, lastSeenAt: entry.lastSeenAt }))
    .sort((a, b) => b.score - a.score || b.lastSeenAt - a.lastSeenAt);
}

/**
 * Picks the single best learned category id, or `null` when there is no
 * confident answer: `null` when nothing matched, the top category when only
 * one category matched (an *uncontested* association always wins, no matter
 * how decayed), and the top category only when it beats the runner-up by at
 * least `MARGIN` when several matched.
 */
export function pickLearnedCategoryId(
  tokens: readonly string[],
  learnings: readonly CategoryLearning[],
  now: number
): number | null {
  const ranked = rankCategoryLearnings(tokens, learnings, now);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0]!.categoryId;

  const [best, second] = ranked;
  return best!.score >= MARGIN * second!.score ? best!.categoryId : null;
}
