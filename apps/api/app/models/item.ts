import { ItemSchema } from '#database/schema'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import List from '#models/list'
import Category from '#models/category'
import User from '#models/user'

export default class Item extends ItemSchema {
  // SQLite has no native boolean type — better-sqlite3 round-trips this
  // column as 0/1 unless explicitly cast.
  @column({ consume: (value: unknown) => Boolean(value), prepare: (value: boolean) => value })
  declare checked: boolean

  @belongsTo(() => List, { foreignKey: 'listId' })
  declare list: BelongsTo<typeof List>

  @belongsTo(() => Category, { foreignKey: 'categoryId' })
  declare category: BelongsTo<typeof Category>

  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare creator: BelongsTo<typeof User>
}
