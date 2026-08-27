import ListMember from '#models/list_member'
import type List from '#models/list'
import type { MemberCandidateResource } from '#transformers/member_candidate_transformer'
import logger from '@adonisjs/core/services/logger'

/**
 * Direct-add candidates for a list: users the requester already shares
 * another list with (both accepted members), minus users already on the
 * target list and the requester themselves. This is the "I already share
 * lists with this person, so adding them to a new list shouldn't need a
 * link" path — see PLAN_00_FOUNDATIONAL_PLAN.md §10.
 */
export async function findMemberCandidates(userId: number, list: List) {
  // Lists the requester is an accepted member of.
  const myMemberships = await ListMember.query()
    .where('userId', userId)
    .whereNotNull('acceptedAt')
    .select('listId')

  // Users already on the target list (at least the requester, who just
  // passed the role check — so this array is never empty below).
  const existingMemberships = await ListMember.query().where('listId', list.id).select('userId')
  const existingUserIds = existingMemberships.map((membership) => membership.userId)

  const sharedMemberships = await ListMember.query()
    .whereIn(
      'listId',
      myMemberships.map((membership) => membership.listId)
    )
    .whereNotNull('acceptedAt')
    .whereNotIn('userId', [...existingUserIds, userId])
    .preload('user')
    .preload('list')
    .orderBy('createdAt', 'asc')

  // Group by user, collecting every shared list's name for picker context.
  const byUser = new Map<number, MemberCandidateResource>()
  for (const membership of sharedMemberships) {
    const existing = byUser.get(membership.userId)
    if (existing) {
      existing.sharedListNames.push(membership.list.name)
    } else {
      byUser.set(membership.userId, {
        user: membership.user,
        sharedListNames: [membership.list.name],
      })
    }
  }

  const result = [...byUser.values()].sort((a, b) => {
    const aName = a.user.fullName ?? a.user.email
    const bName = b.user.fullName ?? b.user.email
    return aName.localeCompare(bName)
  })

  logger.debug(
    { listId: list.id, userId, candidateCount: result.length },
    'found direct-add member candidates'
  )

  return result
}

/** True when both users are accepted members of some common list. */
export async function sharesAListWith(userId: number, otherUserId: number): Promise<boolean> {
  const membership = await ListMember.query()
    .where('userId', otherUserId)
    .whereNotNull('acceptedAt')
    .whereHas('list', (listQuery) =>
      listQuery.whereHas('members', (memberQuery) =>
        memberQuery.where('userId', userId).whereNotNull('acceptedAt')
      )
    )
    .first()

  const shared = membership !== null
  logger.debug({ userId, otherUserId, shared }, 'checked shared list membership')
  return shared
}
