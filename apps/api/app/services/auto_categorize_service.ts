/**
 * Basic auto-categorization: matches an item name against a seeded keyword
 * dictionary keyed by default category name (see database/seeders/
 * default_category_seeder.ts). ML-personalized suggestions are deferred to
 * Phase 6 (PLAN.md §3).
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
}

/**
 * Returns the best-matching default category name for the given item name,
 * or `null` when nothing matches (caller falls back to "Other" or leaves
 * the item uncategorized).
 */
export function suggestCategoryName(itemName: string): string | null {
  const normalized = itemName.trim().toLowerCase()
  if (!normalized) return null

  let bestMatch: { category: string; keywordLength: number } | null = null

  for (const [category, keywords] of Object.entries(KEYWORDS_BY_CATEGORY)) {
    for (const keyword of keywords) {
      if (
        normalized.includes(keyword) &&
        (!bestMatch || keyword.length > bestMatch.keywordLength)
      ) {
        bestMatch = { category, keywordLength: keyword.length }
      }
    }
  }

  return bestMatch?.category ?? null
}
