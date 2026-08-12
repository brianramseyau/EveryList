import { FavoriteItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Category from '#models/category'

export default class FavoriteItem extends FavoriteItemSchema {
  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Category, { foreignKey: 'defaultCategoryId' })
  declare defaultCategory: BelongsTo<typeof Category>
}
