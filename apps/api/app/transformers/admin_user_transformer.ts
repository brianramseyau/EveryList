import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'

/** Separate from `UserTransformer` deliberately — that one is reused all over the app (list
 * members, invites, favorites) and shouldn't start leaking `disabledAt` to every consumer. */
export default class AdminUserTransformer extends BaseTransformer<User> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'fullName',
      'email',
      'createdAt',
      'updatedAt',
      'disabledAt',
    ])
  }
}
