import { SyncEventSchema } from '#database/schema'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import List from '#models/list'

export type SyncEntityType =
  'list' | 'category' | 'item' | 'favorite_item' | 'store' | 'store_category_order'
export type SyncOp = 'create' | 'update' | 'delete' | 'purge'

export default class SyncEvent extends SyncEventSchema {
  declare entityType: SyncEntityType
  declare op: SyncOp

  // better-sqlite3 has no native JSON type — stored as TEXT, round-tripped
  // through JSON.stringify/parse explicitly.
  @column({
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : null),
    prepare: (value: Record<string, unknown> | null) =>
      value === null ? null : JSON.stringify(value),
  })
  declare payload: Record<string, unknown> | null

  @belongsTo(() => List, { foreignKey: 'listId' })
  declare list: BelongsTo<typeof List>
}
