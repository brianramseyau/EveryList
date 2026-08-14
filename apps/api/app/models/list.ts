import { ListSchema } from '#database/schema'
import { belongsTo, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Category from '#models/category'
import Item from '#models/item'
import Store from '#models/store'
import FavoriteItem from '#models/favorite_item'
import ListMember from '#models/list_member'

export default class List extends ListSchema {
  // SQLite has no native boolean type — better-sqlite3 round-trips this
  // column as 0/1 unless explicitly cast.
  @column({ consume: (value: unknown) => Boolean(value), prepare: (value: boolean) => value })
  declare archived: boolean

  @belongsTo(() => User, { foreignKey: 'ownerId' })
  declare owner: BelongsTo<typeof User>

  @hasMany(() => Category, { foreignKey: 'listId' })
  declare categories: HasMany<typeof Category>

  @hasMany(() => Item, { foreignKey: 'listId' })
  declare items: HasMany<typeof Item>

  @hasMany(() => FavoriteItem, { foreignKey: 'listId' })
  declare favoriteItems: HasMany<typeof FavoriteItem>

  @hasMany(() => ListMember, { foreignKey: 'listId' })
  declare members: HasMany<typeof ListMember>

  @manyToMany(() => Store, {
    pivotTable: 'list_stores',
    localKey: 'id',
    pivotForeignKey: 'list_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'store_id',
  })
  declare stores: ManyToMany<typeof Store>
}
