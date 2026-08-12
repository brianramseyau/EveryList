import List from '#models/list'
import { createListValidator, updateListValidator } from '#validators/list'
import type { HttpContext } from '@adonisjs/core/http'
import ListTransformer from '#transformers/list_transformer'
import { DateTime } from 'luxon'

export default class ListsController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const lists = await List.query()
      .where('ownerId', user.id)
      .whereNull('deletedAt')
      .orderBy('createdAt', 'asc')

    return serialize(ListTransformer.transform(lists))
  }

  async store({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createListValidator)

    const list = await List.create({
      name: payload.name,
      color: payload.color ?? '#3b82f6',
      icon: payload.icon ?? null,
      ownerId: user.id,
      archived: false,
    })

    return serialize(ListTransformer.transform(list))
  }

  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await List.query()
      .where('id', params.id)
      .where('ownerId', user.id)
      .whereNull('deletedAt')
      .firstOrFail()

    return serialize(ListTransformer.transform(list))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await List.query()
      .where('id', params.id)
      .where('ownerId', user.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateListValidator)
    list.merge(payload)
    await list.save()

    return serialize(ListTransformer.transform(list))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await List.query()
      .where('id', params.id)
      .where('ownerId', user.id)
      .whereNull('deletedAt')
      .firstOrFail()

    list.deletedAt = DateTime.now()
    await list.save()

    return response.noContent()
  }
}
