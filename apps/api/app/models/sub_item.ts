import { SubItemSchema } from '#database/schema'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'

export default class SubItem extends SubItemSchema {
  // SQLite has no native boolean type — better-sqlite3 round-trips this
  // column as 0/1 unless explicitly cast.
  @column({ consume: (value: unknown) => Boolean(value) })
  declare checked: boolean

  @belongsTo(() => Item, { foreignKey: 'itemId' })
  declare item: BelongsTo<typeof Item>
}
