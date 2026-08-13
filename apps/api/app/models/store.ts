import { StoreSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import List from '#models/list'
import Category from '#models/category'
import StoreCategoryOrder from '#models/store_category_order'

export default class Store extends StoreSchema {
  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare creator: BelongsTo<typeof User>

  @manyToMany(() => List, {
    pivotTable: 'list_stores',
    localKey: 'id',
    pivotForeignKey: 'store_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'list_id',
  })
  declare lists: ManyToMany<typeof List>

  @manyToMany(() => Category, {
    pivotTable: 'store_category_orders',
    localKey: 'id',
    pivotForeignKey: 'store_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'category_id',
    pivotColumns: ['sort_order'],
  })
  declare orderedCategories: ManyToMany<typeof Category>

  @hasMany(() => StoreCategoryOrder, { foreignKey: 'storeId' })
  declare categoryOrders: HasMany<typeof StoreCategoryOrder>
}
