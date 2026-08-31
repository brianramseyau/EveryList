import type List from '#models/list'
import CategoryLearning from '#models/category_learning'
import { pickLearnedCategoryId, suggestCategoryName, tokenizeItemName } from '@everylist/shared'
import type { CategoryLearningDto } from '@everylist/shared'
import { getEffectiveCategories } from '#services/category_service'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'

/**
 * Learned auto-categorization (PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md): a persisted, decayed model
 * that only learns from *explicit* user category assignments — never from the
 * auto-suggestion itself, avoiding self-reinforcement. The static keyword
 * table in packages/shared stays as the fallback. Server-authoritative: the
 * web client caches a read-only copy for offline suggestions, but every
 * write to the model happens here.
 */

/**
 * Records one explicit assignment of `categoryId` to an item named `name`:
 * each name token's count is incremented and its `lastSeenAt` bumped. Rows
 * are never decremented or deleted, so a dormant-but-uncontested mapping
 * still categorizes forever.
 *
 * A list with `useCategoryLearning` disabled (the per-list toggle nested
 * under Categories in list settings) never teaches the model — useful for
 * lists where name→category patterns are meaningless and the learned rows
 * would be pure bloat.
 */
export async function learnCategory(list: List, name: string, categoryId: number): Promise<void> {
  if (list.useCategoryLearning === false) return

  const tokens = tokenizeItemName(name)
  if (tokens.length === 0) return

  const now = DateTime.now()
  for (const token of tokens) {
    const existing = await CategoryLearning.query()
      .where('listId', list.id)
      .where('categoryId', categoryId)
      .where('token', token)
      .first()

    if (existing) {
      existing.count += 1
      existing.lastSeenAt = now
      await existing.save()
    } else {
      await CategoryLearning.create({
        listId: list.id,
        categoryId,
        token,
        count: 1,
        lastSeenAt: now,
      })
    }
  }
}

/**
 * Every learned association for a list, limited to *active* categories — a
 * soft-deleted category's learned rows are dropped here so its stale id is
 * never suggested (the bug the old item-derived heuristic had). Ordered most
 * recently seen first.
 *
 * A list with `useCategoryLearning` disabled reports an empty model — this
 * one gate covers both the read endpoint (and thus the client's offline
 * cache) and `suggestCategoryId`'s learned tier, which falls through to the
 * static keyword table.
 */
export async function getCategoryLearnings(list: List): Promise<CategoryLearningDto[]> {
  if (list.useCategoryLearning === false) return []

  const rows = await CategoryLearning.query()
    .where('listId', list.id)
    .whereHas('category', (query) => query.whereNull('deletedAt'))
    .orderBy('lastSeenAt', 'desc')

  return rows.map((row) => ({
    categoryId: row.categoryId,
    token: row.token,
    count: row.count,
    lastSeenAt: row.lastSeenAt.toISO()!,
  }))
}

/** Learned model first, falling back to the shared static keyword table. */
export async function suggestCategoryId(list: List, itemName: string): Promise<number | null> {
  const tokens = tokenizeItemName(itemName)

  if (tokens.length > 0) {
    const learnings = await getCategoryLearnings(list)
    const learnedId = pickLearnedCategoryId(tokens, learnings, DateTime.now().toMillis())
    if (learnedId !== null) {
      logger.debug(
        { listId: list.id, categoryId: learnedId, source: 'learned' },
        'suggested category for item'
      )
      return learnedId
    }
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
