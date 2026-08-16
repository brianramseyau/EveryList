import ListMember from '#models/list_member'
import { ROLE_RANK } from '#policies/list_policy'
import type { ListRole } from '#models/list_member'
import type { HttpContext } from '@adonisjs/core/http'
import ListInvitePreviewTransformer from '#transformers/list_invite_preview_transformer'
import ListTransformer from '#transformers/list_transformer'
import List from '#models/list'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { findActiveInvite } from '#services/invite_lookup'
import { nextListMemberSortOrder } from '#services/list_member_sort'

export default class InviteAcceptController {
  /** Unauthenticated — lets the join page render a preview before login/signup. */
  async preview({ params, response, serialize }: HttpContext) {
    const invite = await findActiveInvite(params.token)
    if (!invite) return response.notFound({ message: 'Invite not found' })

    await invite.load('list')
    await invite.load('creator')

    return serialize(ListInvitePreviewTransformer.transform(invite))
  }

  /** Authenticated — creates or upgrades the caller's membership on the invite's list. */
  async accept({ auth, params, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const invite = await findActiveInvite(params.token)
    if (!invite) return response.notFound({ message: 'Invite not found' })

    // Every ListMember row in this join-link-only flow is created already
    // accepted (there's no separate email-invite "pending" state — see
    // PLAN.md §10), so accepting an invite twice is just an idempotent
    // role-upgrade: never downgrade an existing member's access.
    const existing = await ListMember.query()
      .where('listId', invite.listId)
      .where('userId', user.id)
      .first()

    const inviteRole = invite.role as ListRole
    const now = DateTime.now()

    if (!existing) {
      await ListMember.create({
        listId: invite.listId,
        userId: user.id,
        role: inviteRole,
        invitedAt: now,
        acceptedAt: now,
        sortOrder: await nextListMemberSortOrder(user.id),
      })
    } else if (ROLE_RANK[inviteRole] > ROLE_RANK[existing.role]) {
      existing.role = inviteRole
      await existing.save()
    }

    await broadcastSync({
      listId: invite.listId,
      entityType: 'list',
      entityId: invite.listId,
      op: 'update',
    })

    const list = await List.query()
      .where('id', invite.listId)
      .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
      .firstOrFail()

    return serialize(ListTransformer.transform(list))
  }
}
