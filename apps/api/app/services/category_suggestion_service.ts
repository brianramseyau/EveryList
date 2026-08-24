import type List from '#models/list'
import Item from '#models/item'
import { suggestCategoryName } from '@everylist/shared'
import { getEffectiveCategories } from '#services/category_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Frequency-based personalization on top of the static keyword table — see
 * PHASE7_PLAN.md §3. Scoped per-list (not per-user): a shared list's own
 * naming history is a better signal than a global one, and it benefits
 * every member equally without needing per-user profiles.
 */
async function personalizedCategoryId(list: List, itemName: string): Promise<number | null> {
  const normalized = itemName.trim().toLowerCase()
  if (!normalized) return null

  const row = await Item.query()
    .where('listId', list.id)
    .whereRaw('LOWER(name) = ?', [normalized])
    .whereNotNull('categoryId')
    .select('categoryId')
    .count('* as count')
    .groupBy('categoryId')
    .orderBy('count', 'desc')
    .first()

  return (row?.categoryId as number | undefined) ?? null
}

/** Personalized history first, falling back to the shared static keyword table. */
export async function suggestCategoryId(list: List, itemName: string): Promise<number | null> {
  const personalized = await personalizedCategoryId(list, itemName)
  if (personalized) {
    logger.debug(
      { listId: list.id, categoryId: personalized, source: 'personalized' },
      'suggested category for item'
    )
    return personalized
  }

  const suggestedName = suggestCategoryName(itemName)
  if (!suggestedName) {
    logger.debug({ listId: list.id }, 'no category suggestion matched item')
    return null
  }

  const categories = await getEffectiveCategories(list)
  const categoryId = categories.find((category) => category.name === suggestedName)?.id ?? null
  logger.debug({ listId: list.id, categoryId, source: 'keyword' }, 'suggested category for item')
  return categoryId
}
