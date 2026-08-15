import type Folder from '#models/folder'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class FolderTransformer extends BaseTransformer<Folder> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'userId',
      'name',
      'color',
      'sortOrder',
      'createdAt',
      'updatedAt',
      'version',
    ])
  }
}
