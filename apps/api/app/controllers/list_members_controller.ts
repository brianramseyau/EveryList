import ListMember from '#models/list_member'
import ListPolicy from '#policies/list_policy'
import { updateListMemberRoleValidator } from '#validators/list_member'
import type { HttpContext } from '@adonisjs/core/http'
import ListMemberTransformer from '#transformers/list_member_transformer'
import { broadcastSync } from '#services/sync_broadcaster'

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
    const list = await ListPolicy.requireList(user.id, params.listId, 'viewer')
    const members = await ListMember.query()
      .where('listId', list.id)
      .whereNotNull('acceptedAt')
      .preload('user')
      .orderBy('createdAt', 'asc')

    return serialize(ListMemberTransformer.transform(members))
  }

  async update({ auth, params, request, serialize, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'owner')
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

    return serialize(ListMemberTransformer.transform(member))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'owner')
    const member = await ListMember.query()
      .where('id', params.memberId)
      .where('listId', list.id)
      .firstOrFail()

    if (member.role === 'owner' && (await countOwners(list.id)) <= 1) {
      return response.badRequest({ message: 'A list must always have at least one owner' })
    }

    await member.delete()
    await broadcastSync({ listId: list.id, entityType: 'list', entityId: list.id, op: 'update' })

    return response.noContent()
  }
}
