import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'
import UserTransformer from '#transformers/user_transformer'

export interface MemberCandidateResource {
  user: User
  sharedListNames: string[]
}

/**
 * A direct-add candidate: a user the requester already shares another list
 * with, plus the names of those shared lists for picker context.
 */
export default class MemberCandidateTransformer extends BaseTransformer<MemberCandidateResource> {
  toObject() {
    return {
      user: UserTransformer.transform(this.resource.user),
      sharedListNames: this.resource.sharedListNames,
    }
  }
}
