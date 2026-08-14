import type Store from '#models/store'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class StoreTransformer extends BaseTransformer<Store> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'name',
      'color',
      'createdBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'version',
    ])
  }
}
