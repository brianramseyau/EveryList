import List from '#models/list'
import ListMember from '#models/list_member'
import Store from '#models/store'
import type User from '#models/user'
import type { ListRole } from '#models/list_member'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { ListForbiddenException, ListNotFoundException } from '#exceptions/list_access_exceptions'

export const ROLE_RANK: Record<ListRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

/** Parses a PAT's `list:<id>:<role>` ability strings for a grant on `listId`, or `null`. */
function tokenGrantFor(token: AccessToken, listId: number | string): ListRole | null {
  const target = String(listId)
  for (const ability of token.abilities) {
    const [kind, id, role] = ability.split(':')
    if (kind === 'list' && id === target && (role === 'editor' || role === 'viewer')) {
      return role
    }
  }
  return null
}

/**
 * Membership/role checks backing every list-scoped and store-scoped
 * controller action — see PLAN.md §7/§10. Replaces the owner-only
 * `.where('ownerId', ...)` stand-in used through Phase 2/3.
 */
export default class ListPolicy {
  /**
   * Reduces a membership-derived role down to what the current request's
   * token actually grants. Ordinary login tokens (`currentAccessToken.type
   * !== 'pat'`) pass the membership role through unchanged. A PAT must carry
   * an explicit grant for `listId` — no grant means no access at all,
   * regardless of the underlying user's real membership — and a grant can
   * never exceed the user's real membership role (so a token survives a
   * later membership downgrade correctly, never with more access than the
   * account currently has).
   */
  static effectiveRole(
    user: User,
    listId: number | string,
    membershipRole: ListRole | null
  ): ListRole | null {
    if (membershipRole === null) return null

    const token = user.currentAccessToken
    if (!token || token.type !== 'pat') return membershipRole

    const grant = tokenGrantFor(token, listId)
    if (!grant) return null

    return ROLE_RANK[grant] <= ROLE_RANK[membershipRole] ? grant : membershipRole
  }

  /** The user's effective role on a list, or `null` if they have no accepted membership (or, for a PAT, no grant on this list). */
  static async roleFor(user: User, listId: number | string): Promise<ListRole | null> {
    const membership = await ListMember.query()
      .where('listId', listId)
      .where('userId', user.id)
      .whereNotNull('acceptedAt')
      .first()

    const membershipRole = (membership?.role as ListRole | undefined) ?? null
    return ListPolicy.effectiveRole(user, listId, membershipRole)
  }

  /**
   * Loads the list, requiring the user to have at least `minRole` on it.
   * A list that doesn't exist and a list the user isn't a member of are
   * both reported as 404, so membership can't be probed by id.
   */
  static async requireList(user: User, listId: number | string, minRole: ListRole): Promise<List> {
    const list = await List.query().where('id', listId).whereNull('deletedAt').first()
    if (!list) throw new ListNotFoundException()

    const role = await ListPolicy.roleFor(user, list.id)
    if (!role) throw new ListNotFoundException()
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new ListForbiddenException()

    return list
  }

  /**
   * The user's best (highest-ranked) effective role across every list a
   * store is attached to — a store is visible/editable via membership on
   * *any* of its lists, per PLAN.md §7. For a PAT, each list's role is
   * first reduced through `effectiveRole` before taking the best one, so a
   * token can't reach a store solely through a list it has no grant on.
   */
  static async storeRoleFor(user: User, storeId: number | string): Promise<ListRole | null> {
    const memberships = await ListMember.query()
      .where('userId', user.id)
      .whereNotNull('acceptedAt')
      .whereHas('list', (query) => query.whereHas('stores', (q) => q.where('stores.id', storeId)))

    if (memberships.length === 0) return null

    const roles = memberships
      .map((membership) =>
        ListPolicy.effectiveRole(user, membership.listId, membership.role as ListRole)
      )
      .filter((role): role is ListRole => role !== null)

    if (roles.length === 0) return null

    return roles.reduce((best, role) => (ROLE_RANK[role] > ROLE_RANK[best] ? role : best))
  }

  /** Loads the store, requiring the user to have at least `minRole` on some list it's attached to. */
  static async requireStoreRole(
    user: User,
    storeId: number | string,
    minRole: ListRole
  ): Promise<Store> {
    const store = await Store.query().where('id', storeId).whereNull('deletedAt').first()
    if (!store) throw new ListNotFoundException()

    const role = await ListPolicy.storeRoleFor(user, store.id)
    if (!role) throw new ListNotFoundException()
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new ListForbiddenException()

    return store
  }
}
