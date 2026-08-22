import { BaseTransformer } from '@adonisjs/core/transformers'
import type { ListRole } from '#models/list_member'

/**
 * A PAT isn't a Lucid model (it's an AdonisJS `AccessToken`), and its list
 * grants live encoded inside `abilities` rather than as columns — the
 * controller decodes those into this flat view before transforming, and the
 * plaintext token value is never included here (see
 * `personal_access_tokens_controller.ts#store` for the one place it appears).
 */
export interface PersonalAccessTokenView {
  id: string | number | BigInt
  name: string | null
  grants: { listId: number; role: ListRole }[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export default class PersonalAccessTokenTransformer extends BaseTransformer<PersonalAccessTokenView> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'name',
      'grants',
      'lastUsedAt',
      'expiresAt',
      'createdAt',
    ])
  }
}
