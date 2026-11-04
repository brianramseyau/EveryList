/**
 * Auto-categorization in two tiers, shared between the API (server-side
 * suggestion/learning) and the web client (offline fallback) so both sides
 * agree on a guess without a round trip — see PLAN_00_FOUNDATIONAL_PLAN.md §9.
 *
 * Tier 1 is the learned model: explicit user category assignments are stored
 * server-side in `category_learnings` (one row per list/token/category) and
 * ranked here via exponential half-life decay with a floor, weighted by each
 * token's distinctiveness across categories — see
 * PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md,
 * PLAN_37_PHASE_AUTO_CATEGORIZATION_REFINEMENTS.md and apps/api's
 * category_suggestion_service.ts.
 *
 * There is no runtime static tier. `STARTER_CATEGORY_KEYWORDS` is single-word
 * seed data: `seedStarterCategories` translates it into ordinary
 * `category_learnings` rows attached to the created category IDs, so the
 * learned tier is the only matcher — see
 * PLAN_37_PHASE_AUTO_CATEGORIZATION_REFINEMENTS.md.
 */

/** A seeded starter category's stable identity. */
export const STARTER_CATEGORY_KEYS = [
	'produce',
	'dairy',
	'meat',
	'bakery',
	'frozen',
	'pantry',
	'household',
] as const;

export type StarterCategoryKey = (typeof STARTER_CATEGORY_KEYS)[number];

/** Single-word keywords used only to seed a new list's learned model. */
export const STARTER_CATEGORY_KEYWORDS: Record<StarterCategoryKey, readonly string[]> = {
	produce: [
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
	dairy: [
		'milk',
		'cheese',
		'yogurt',
		'yoghurt',
		'butter',
		'cream',
		'egg',
		'eggs',
	],
	meat: [
		'chicken',
		'beef',
		'pork',
		'turkey',
		'bacon',
		'sausage',
		'steak',
		'ham',
		'fish',
		'salmon',
		'shrimp',
		'lamb',
	],
	bakery: ['bread', 'bagel', 'bun', 'roll', 'muffin', 'croissant', 'tortilla', 'cake', 'donut'],
	frozen: ['frozen', 'popsicle', 'freezer'],
	pantry: [
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
		'jam',
		'honey',
		'nuts',
	],
	household: [
		'soap',
		'detergent',
		'napkin',
		'cleaner',
		'sponge',
		'foil',
		'battery',
		'shampoo',
		'toothpaste',
		'deodorant',
	],
};

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
 * token appears in `tokens`, weighted by each token's *distinctiveness*.
 *
 * A token that has only ever been assigned to one category is a strong signal;
 * one that is spread across many categories ("rice" under five different
 * categories) is close to noise. Each contribution is therefore divided by
 * `df(token)` — the number of distinct categories that token is learned under
 * — so a longer name containing one specific token still inherits the category
 * of a previously-matched shorter name instead of being pulled apart by its
 * more common words. Sorted by score descending, ties broken by most recent
 * `lastSeenAt`.
 */
export function rankCategoryLearnings(
  tokens: readonly string[],
  learnings: readonly CategoryLearning[],
  now: number
): RankedCategory[] {
  const tokenSet = new Set(tokens);

  // `df` counts distinct categories per token, not rows: two learnings for the
  // same (token, category) pair are still one category.
  const categoryIdsByToken = new Map<string, Set<number>>();
  for (const learning of learnings) {
    if (!tokenSet.has(learning.token)) continue;
    const categoryIds = categoryIdsByToken.get(learning.token) ?? new Set<number>();
    categoryIds.add(learning.categoryId);
    categoryIdsByToken.set(learning.token, categoryIds);
  }

  const byCategory = new Map<number, { score: number; lastSeenAt: number }>();

  for (const learning of learnings) {
    if (!tokenSet.has(learning.token)) continue;

    const lastSeenAt =
      typeof learning.lastSeenAt === 'string'
        ? new Date(learning.lastSeenAt).getTime()
        : learning.lastSeenAt;

    const df = categoryIdsByToken.get(learning.token)!.size;
    const contribution = (learning.count * decayWeight(now - lastSeenAt)) / df;

    const entry = byCategory.get(learning.categoryId);
    if (entry) {
      entry.score += contribution;
      if (lastSeenAt > entry.lastSeenAt) entry.lastSeenAt = lastSeenAt;
    } else {
      byCategory.set(learning.categoryId, { score: contribution, lastSeenAt });
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
