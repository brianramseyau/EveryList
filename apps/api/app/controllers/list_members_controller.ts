import User from '#models/user'
import ListMember from '#models/list_member'
import ListPolicy from '#policies/list_policy'
import { createListMemberValidator, updateListMemberRoleValidator } from '#validators/list_member'
import type { HttpContext } from '@adonisjs/core/http'
import ListMemberTransformer from '#transformers/list_member_transformer'
import MemberCandidateTransformer from '#transformers/member_candidate_transformer'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { findMemberCandidates, sharesAListWith } from '#services/member_candidates'
import { nextListMemberSortOrder } from '#services/list_member_sort'

async function countOwners(listId: number): Promise<number> {
  const owners = await ListMember.query()
    .where('listId', listId)
    .where('role', 'owner')
    .whereNotNull('acceptedAt')
  return owners.length
}

export default class ListMembersController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    const members = await ListMember.query()
      .where('listId', list.id)
      .whereNotNull('acceptedAt')
      .preload('user')
      .orderBy('createdAt', 'asc')

    return serialize(ListMemberTransformer.transform(members))
  }

  /** Users the requester could directly add: people they already share another list with. */
  async candidates({ auth, params, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const candidates = await findMemberCandidates(user.id, list)

    logger.debug(
      { listId: list.id, userId: user.id, candidateCount: candidates.length },
      'listed direct-add member candidates'
    )

    return serialize(MemberCandidateTransformer.transform(candidates))
  }

  /**
   * Directly adds an existing user who already shares another list with the
   * requester — no link/accept dance needed for someone you're already
   * sharing lists with. The membership is created already-accepted, matching
   * the join-link flow's behavior (see invite_accept_controller.ts).
   */
  async store({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const payload = await request.validateUsing(createListMemberValidator)

    const target = await User.find(payload.userId)
    if (!target) {
      return response.badRequest({ message: 'User not found' })
    }

    const existing = await ListMember.query()
      .where('listId', list.id)
      .where('userId', target.id)
      .first()
    if (existing) {
      return response.badRequest({ message: 'That user is already a member of this list' })
    }

    if (!(await sharesAListWith(user.id, target.id))) {
      return response.badRequest({
        message: 'You can only add someone you already share a list with',
      })
    }

    const now = DateTime.now()
    const member = await ListMember.create({
      listId: list.id,
      userId: target.id,
      role: payload.role,
      invitedAt: now,
      acceptedAt: now,
      sortOrder: await nextListMemberSortOrder(target.id),
    })

    await member.load('user')

    await broadcastSync({ listId: list.id, entityType: 'list', entityId: list.id, op: 'update' })

    logger.debug(
      { listId: list.id, userId: target.id, role: payload.role },
      'directly added list member'
    )

    return serialize(ListMemberTransformer.transform(member))
  }

  async update({ auth, params, request, serialize, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'owner')
    const member = await ListMember.query()
      .where('id', params.memberId)
      .where('listId', list.id)
      .firstOrFail()

    if (member.role === 'owner' && (await countOwners(list.id)) <= 1) {
      return response.badRequest({ message: 'A list must always have at least one owner' })
    }

    const payload = await request.validateUsing(updateListMemberRoleValidator)
    member.role = payload.role
    await member.save()
    await member.load('user')

    await broadcastSync({ listId: list.id, entityType: 'list', entityId: list.id, op: 'update' })

    logger.debug(
      { listId: list.id, memberId: member.id, role: member.role },
      'updated list member role'
    )

    return serialize(ListMemberTransformer.transform(member))
  }

  async destroy({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'owner')
    const member = await ListMember.query()
      .where('id', params.memberId)
      .where('listId', list.id)
      .firstOrFail()

    if (member.role === 'owner' && (await countOwners(list.id)) <= 1) {
      return response.badRequest({ message: 'A list must always have at least one owner' })
    }

    await member.delete()
    await broadcastSync({ listId: list.id, entityType: 'list', entityId: list.id, op: 'update' })

    logger.debug({ listId: list.id, memberId: member.id }, 'removed list member')

    return response.noContent()
  }
}
