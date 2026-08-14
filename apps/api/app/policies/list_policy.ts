import List from '#models/list'
import ListMember from '#models/list_member'
import Store from '#models/store'
import type { ListRole } from '#models/list_member'
import { ListForbiddenException, ListNotFoundException } from '#exceptions/list_access_exceptions'

export const ROLE_RANK: Record<ListRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

/**
 * Membership/role checks backing every list-scoped and store-scoped
 * controller action — see PLAN.md §7/§10. Replaces the owner-only
 * `.where('ownerId', ...)` stand-in used through Phase 2/3.
 */
export default class ListPolicy {
  /** The user's role on a list, or `null` if they have no accepted membership. */
  static async roleFor(userId: number, listId: number | string): Promise<ListRole | null> {
    const membership = await ListMember.query()
      .where('listId', listId)
      .where('userId', userId)
      .whereNotNull('acceptedAt')
      .first()

    return (membership?.role as ListRole | undefined) ?? null
  }

  /**
   * Loads the list, requiring the user to have at least `minRole` on it.
   * A list that doesn't exist and a list the user isn't a member of are
   * both reported as 404, so membership can't be probed by id.
   */
  static async requireList(
    userId: number,
    listId: number | string,
    minRole: ListRole
  ): Promise<List> {
    const list = await List.query().where('id', listId).whereNull('deletedAt').first()
    if (!list) throw new ListNotFoundException()

    const role = await ListPolicy.roleFor(userId, list.id)
    if (!role) throw new ListNotFoundException()
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new ListForbiddenException()

    return list
  }

  /**
   * The user's best (highest-ranked) role across every list a store is
   * attached to — a store is visible/editable via membership on *any* of
   * its lists, per PLAN.md §7.
   */
  static async storeRoleFor(userId: number, storeId: number | string): Promise<ListRole | null> {
    const memberships = await ListMember.query()
      .where('userId', userId)
      .whereNotNull('acceptedAt')
      .whereHas('list', (query) => query.whereHas('stores', (q) => q.where('stores.id', storeId)))

    if (memberships.length === 0) return null

    return memberships
      .map((membership) => membership.role as ListRole)
      .reduce((best, role) => (ROLE_RANK[role] > ROLE_RANK[best] ? role : best))
  }

  /** Loads the store, requiring the user to have at least `minRole` on some list it's attached to. */
  static async requireStoreRole(
    userId: number,
    storeId: number | string,
    minRole: ListRole
  ): Promise<Store> {
    const store = await Store.query().where('id', storeId).whereNull('deletedAt').first()
    if (!store) throw new ListNotFoundException()

    const role = await ListPolicy.storeRoleFor(userId, store.id)
    if (!role) throw new ListNotFoundException()
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new ListForbiddenException()

    return store
  }
}
