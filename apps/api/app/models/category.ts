import { CategorySchema } from '#database/schema'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import List from '#models/list'
import Item from '#models/item'

export default class Category extends CategorySchema {
  // SQLite has no native boolean type — better-sqlite3 round-trips this
  // column as 0/1 unless explicitly cast.
  @column({ consume: (value: unknown) => Boolean(value), prepare: (value: boolean) => value })
  declare isDefault: boolean

  @belongsTo(() => List, { foreignKey: 'listId' })
  declare list: BelongsTo<typeof List>

  @hasMany(() => Item, { foreignKey: 'categoryId' })
  declare items: HasMany<typeof Item>
}
