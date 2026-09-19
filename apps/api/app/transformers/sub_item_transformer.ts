import type SubItem from '#models/sub_item'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class SubItemTransformer extends BaseTransformer<SubItem> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'itemId',
      'name',
      'checked',
      'checkedAt',
      'sortOrder',
      'createdBy',
      'createdAt',
      'updatedAt',
      'version',
    ])
  }
}
