import type List from '#models/list'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ListTransformer extends BaseTransformer<List> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'name',
        'color',
        'icon',
        'ownerId',
        'folderId',
        'archived',
        'createdAt',
        'updatedAt',
        'version',
      ]),
      itemCount: this.whenCounted('items') ?? 0,
    }
  }
}
