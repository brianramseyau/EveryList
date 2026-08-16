import List from '#models/list'
import Folder from '#models/folder'
import ListPolicy from '#policies/list_policy'
import { createListValidator, updateListValidator } from '#validators/list'
import type { HttpContext } from '@adonisjs/core/http'
import ListTransformer from '#transformers/list_transformer'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { createOwnedList } from '#services/list_creation'
import { hasVersionConflict, parseExpectedVersion } from '#services/version_conflict'

async function findDuplicateNamedList(ownerId: number, name: string, excludeId?: number) {
  const query = List.query()
    .where('ownerId', ownerId)
    .whereNull('deletedAt')
    .whereRaw('LOWER(TRIM(name)) = ?', [name.trim().toLowerCase()])

  if (excludeId !== undefined) {
    query.whereNot('id', excludeId)
  }

  return query.first()
}

export default class ListsController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const lists = await List.query()
      .whereHas('members', (query) => query.where('userId', user.id).whereNotNull('acceptedAt'))
      .whereNull('deletedAt')
      .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
      .withCount('members', (query) => query.whereNotNull('acceptedAt'))
      .preload('members', (query) => query.where('userId', user.id))
      .preload('owner')
      .orderBy('createdAt', 'asc')

    return serialize(ListTransformer.transform(lists))
  }

  async store({ auth, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createListValidator)

    if (await findDuplicateNamedList(user.id, payload.name)) {
      return response.status(422).send({
        errors: [{ field: 'name', message: 'You already have a list with this name.' }],
      })
    }

    const list = await createOwnedList({
      ownerId: user.id,
      name: payload.name,
      color: payload.color ?? '#3b82f6',
      icon: payload.icon ?? null,
      useCategories: payload.useCategories,
    })

    return serialize(ListTransformer.transform(list))
  }

  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user.id, params.id, 'viewer')
    const list = await List.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
      .withCount('members', (query) => query.whereNotNull('acceptedAt'))
      .preload('members', (query) => query.where('userId', user.id))
      .preload('owner')
      .firstOrFail()

    return serialize(ListTransformer.transform(list))
  }

  async update({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user.id, params.id, 'owner')
    const list = await List.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
      .firstOrFail()

    const payload = await request.validateUsing(updateListValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(list, expectedVersion)) {
      return response
        .status(409)
        .send({ ...(await serialize(ListTransformer.transform(list))), conflict: true })
    }

    if (rest.folderId !== null && rest.folderId !== undefined) {
      await Folder.query().where('id', rest.folderId).where('userId', user.id).firstOrFail()
    }

    if (rest.name !== undefined && (await findDuplicateNamedList(user.id, rest.name, list.id))) {
      return response.status(422).send({
        errors: [{ field: 'name', message: 'You already have a list with this name.' }],
      })
    }

    list.merge(rest)
    list.version += 1
    await list.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'list',
      entityId: list.id,
      op: 'update',
      version: list.version,
    })

    return serialize(ListTransformer.transform(list))
  }

  async destroy({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user.id, params.id, 'owner')
    const list = await List.query().where('id', params.id).whereNull('deletedAt').firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(list, expectedVersion)) {
      return response
        .status(409)
        .send({ ...(await serialize(ListTransformer.transform(list))), conflict: true })
    }

    list.deletedAt = DateTime.now()
    list.version += 1
    await list.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'list',
      entityId: list.id,
      op: 'delete',
      version: list.version,
    })

    return response.noContent()
  }
}
