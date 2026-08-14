import type ListMember from '#models/list_member'
import { BaseTransformer } from '@adonisjs/core/transformers'
import UserTransformer from '#transformers/user_transformer'

// Every call site preloads `user` before transforming — see
// list_members_controller.ts — so this always has a value to serialize.
export default class ListMemberTransformer extends BaseTransformer<ListMember> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'listId', 'userId', 'role', 'invitedAt', 'acceptedAt']),
      user: UserTransformer.transform(this.resource.user),
    }
  }
}
