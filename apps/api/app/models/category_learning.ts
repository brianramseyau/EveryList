import { CategoryLearningSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import List from '#models/list'
import Category from '#models/category'

/**
 * One learned name→category association for a list (PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md). Rows
 * are never deleted — `count` only ever increments and `lastSeenAt` only
 * ever bumps — so a long-dormant mapping still categorizes an item whose
 * name has no competing association. Read/written through
 * `app/services/category_suggestion_service.ts`.
 */
export default class CategoryLearning extends CategoryLearningSchema {
  @belongsTo(() => List, { foreignKey: 'listId' })
  declare list: BelongsTo<typeof List>

  @belongsTo(() => Category, { foreignKey: 'categoryId' })
  declare category: BelongsTo<typeof Category>
}
