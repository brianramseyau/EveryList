import { randomBytes } from 'node:crypto'
import ListInvite from '#models/list_invite'
import ListPolicy from '#policies/list_policy'
import { createListInviteValidator } from '#validators/list_invite'
import type { HttpContext } from '@adonisjs/core/http'
import ListInviteTransformer from '#transformers/list_invite_transformer'
import { DateTime } from 'luxon'

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

export default class ListInvitesController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const invites = await ListInvite.query()
      .where('listId', list.id)
      .whereNull('revokedAt')
      .orderBy('createdAt', 'desc')

    return serialize(ListInviteTransformer.transform(invites))
  }

  async store({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const payload = await request.validateUsing(createListInviteValidator)

    const invite = await ListInvite.create({
      listId: list.id,
      token: generateToken(),
      role: payload.role,
      createdBy: user.id,
      expiresAt: null,
      revokedAt: null,
    })

    logger.debug({ listId: list.id, inviteId: invite.id, role: invite.role }, 'created list invite')

    return serialize(ListInviteTransformer.transform(invite))
  }

  async destroy({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const invite = await ListInvite.query()
      .where('id', params.inviteId)
      .where('listId', list.id)
      .firstOrFail()

    invite.revokedAt = DateTime.now()
    await invite.save()

    logger.debug({ listId: list.id, inviteId: invite.id }, 'revoked list invite')

    return response.noContent()
  }
}
