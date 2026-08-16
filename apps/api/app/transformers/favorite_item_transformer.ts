import type FavoriteItem from '#models/favorite_item'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class FavoriteItemTransformer extends BaseTransformer<FavoriteItem> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'userId',
      'listId',
      'name',
      'defaultCategoryId',
      'defaultQuantity',
      'storeId',
      'notes',
      'price',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'version',
    ])
  }
}
