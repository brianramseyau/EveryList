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
        'badgeExcluded',
        'useCategories',
        'passcodeHash',
        'createdAt',
        'updatedAt',
        'version',
      ]),
      itemCount: this.whenCounted('items') ?? 0,
      // Populated only when the controller preloaded `members` scoped to the
      // requesting user (list index/show) — null elsewhere rather than an
      // extra query per transform.
      role: this.resource.members?.[0]?.role ?? null,
      memberCount: this.whenCounted('members') ?? 1,
      ownerName: this.resource.owner?.fullName ?? null,
    }
  }
}
