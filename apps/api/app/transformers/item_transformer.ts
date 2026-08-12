import type Item from '#models/item'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ItemTransformer extends BaseTransformer<Item> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'listId',
      'name',
      'quantity',
      'notes',
      'categoryId',
      'checked',
      'checkedAt',
      'sortOrder',
      'createdBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ])
  }
}
