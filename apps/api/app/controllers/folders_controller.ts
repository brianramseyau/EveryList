import Folder from '#models/folder'
import {
  createFolderValidator,
  updateFolderValidator,
  reorderFoldersValidator,
} from '#validators/folder'
import type { HttpContext } from '@adonisjs/core/http'
import FolderTransformer from '#transformers/folder_transformer'
import { hasVersionConflict, parseExpectedVersion } from '#services/version_conflict'

async function nextSortOrder(userId: number): Promise<number> {
  const result = await Folder.query()
    .where('userId', userId)
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}

export default class FoldersController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const folders = await Folder.query().where('userId', user.id).orderBy('sortOrder', 'asc')

    return serialize(FolderTransformer.transform(folders))
  }

  async store({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createFolderValidator)

    const folder = await Folder.create({
      userId: user.id,
      name: payload.name,
      color: payload.color ?? '#3b82f6',
      sortOrder: await nextSortOrder(user.id),
      version: 1,
    })

    return serialize(FolderTransformer.transform(folder))
  }

  async update({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const folder = await Folder.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()

    const payload = await request.validateUsing(updateFolderValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(folder, expectedVersion)) {
      return response
        .status(409)
        .send({ ...(await serialize(FolderTransformer.transform(folder))), conflict: true })
    }

    folder.merge(rest)
    folder.version += 1
    await folder.save()

    return serialize(FolderTransformer.transform(folder))
  }

  async destroy({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const folder = await Folder.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(folder, expectedVersion)) {
      return response.status(409).send({ conflict: true })
    }

    await folder.delete()

    return response.noContent()
  }

  async reorder({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const { order } = await request.validateUsing(reorderFoldersValidator)

    const folders = await Folder.query().whereIn('id', order).where('userId', user.id)
    const foldersById = new Map(folders.map((folder) => [folder.id, folder]))

    for (const [index, folderId] of order.entries()) {
      const folder = foldersById.get(folderId)
      if (!folder) continue

      folder.sortOrder = index
      folder.version += 1
      await folder.save()
    }

    const allFolders = await Folder.query().where('userId', user.id).orderBy('sortOrder', 'asc')
    return serialize(FolderTransformer.transform(allFolders))
  }
}
