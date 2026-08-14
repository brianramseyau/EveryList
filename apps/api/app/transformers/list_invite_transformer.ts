import type ListInvite from '#models/list_invite'
import { BaseTransformer } from '@adonisjs/core/transformers'

/** Full shape for the owner/editor's "manage invites" view. */
export default class ListInviteTransformer extends BaseTransformer<ListInvite> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'listId',
      'token',
      'role',
      'createdBy',
      'expiresAt',
      'revokedAt',
      'createdAt',
    ])
  }
}
