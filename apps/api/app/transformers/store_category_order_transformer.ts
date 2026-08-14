import type StoreCategoryOrder from '#models/store_category_order'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class StoreCategoryOrderTransformer extends BaseTransformer<StoreCategoryOrder> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'storeId',
      'categoryId',
      'sortOrder',
      'deletedAt',
      'version',
    ])
  }
}
