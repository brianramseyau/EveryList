import type ListInvite from '#models/list_invite'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * Minimal, pre-auth-safe shape for the invite-preview endpoint — no
 * token/ids, just enough for the join page to render "You've been invited
 * to <list> as <role> by <inviter>".
 */
export default class ListInvitePreviewTransformer extends BaseTransformer<ListInvite> {
  toObject() {
    return {
      listName: this.resource.list.name,
      inviterName: this.resource.creator.fullName ?? this.resource.creator.email,
      role: this.resource.role,
    }
  }
}
