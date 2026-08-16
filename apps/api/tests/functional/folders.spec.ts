import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { FolderDto, ListDto } from '@everylist/shared'
import { bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Test List' })
  return bodyData<ListDto>(response).id
}

test.group('Folders', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates folders in order, lists them, renames one, and files a list into it', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const createA = await client
      .post('/api/v1/folders')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Groceries' })
    createA.assertStatus(200)
    const folderA = bodyData<FolderDto>(createA)
    assert.equal(folderA.name, 'Groceries')
    assert.equal(folderA.sortOrder, 0)
    assert.equal(folderA.color, '#3b82f6')

    const createB = await client
      .post('/api/v1/folders')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Household', color: '#ff0000' })
    createB.assertStatus(200)
    const folderB = bodyData<FolderDto>(createB)
    assert.equal(folderB.sortOrder, 1)

    const index = await client.get('/api/v1/folders').header('Authorization', `Bearer ${token}`)
    index.assertStatus(200)
    const folders = bodyData<FolderDto[]>(index)
    assert.lengthOf(folders, 2)
    assert.equal(folders[0]!.id, folderA.id)

    const rename = await client
      .patch(`/api/v1/folders/${folderA.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Grocery Lists' })
    rename.assertStatus(200)
    assert.equal(bodyData<FolderDto>(rename).name, 'Grocery Lists')
    assert.equal(bodyData<FolderDto>(rename).version, 2)

    const file = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ folderId: folderA.id })
    file.assertStatus(200)
    assert.equal(bodyData<ListDto>(file).folderId, folderA.id)

    const unfile = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ folderId: null })
    unfile.assertStatus(200)
    assert.isNull(bodyData<ListDto>(unfile).folderId)
  })

  test('deleting a folder unfiles its lists rather than deleting them', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post('/api/v1/folders')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Groceries' })
    const folderId = bodyData<FolderDto>(create).id

    await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ folderId })

    const destroy = await client
      .delete(`/api/v1/folders/${folderId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)

    const list = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    assert.isNull(bodyData<ListDto>(list).folderId)
  })

  test('update honors expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/folders')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Groceries' })
    const folder = bodyData<FolderDto>(create)
    assert.equal(folder.version, 1)

    const unversioned = await client
      .patch(`/api/v1/folders/${folder.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ color: '#ff0000' })
    unversioned.assertStatus(200)
    assert.equal(bodyData<FolderDto>(unversioned).version, 2)

    const stale = await client
      .patch(`/api/v1/folders/${folder.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ color: '#00ff00', expectedVersion: 1 })
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)

    const matching = await client
      .patch(`/api/v1/folders/${folder.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ color: '#00ff00', expectedVersion: 2 })
    matching.assertStatus(200)
    assert.equal(bodyData<FolderDto>(matching).version, 3)

    const staleDestroy = await client
      .delete(`/api/v1/folders/${folder.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ expectedVersion: 1 })
    staleDestroy.assertStatus(409)

    const destroy = await client
      .delete(`/api/v1/folders/${folder.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ expectedVersion: 3 })
    destroy.assertStatus(204)
  })

  test('a stranger cannot see, rename, delete, or file a list into another user’s folder', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post('/api/v1/folders')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries' })
    const folderId = bodyData<FolderDto>(create).id

    const stranger = await signupAndGetUser(client)

    const index = await client
      .get('/api/v1/folders')
      .header('Authorization', `Bearer ${stranger.token}`)
    index.assertStatus(200)
    index.assertBodyContains({ data: [] })

    const rename = await client
      .patch(`/api/v1/folders/${folderId}`)
      .header('Authorization', `Bearer ${stranger.token}`)
      .json({ name: 'Hijacked' })
    rename.assertStatus(404)

    const destroy = await client
      .delete(`/api/v1/folders/${folderId}`)
      .header('Authorization', `Bearer ${stranger.token}`)
    destroy.assertStatus(404)

    const file = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${stranger.token}`)
      .json({ folderId })
    file.assertStatus(404)
  })

  test('a list owner gets a 404 filing a list into a folder they do not own', async ({
    client,
  }) => {
    const owner = await signupAndGetToken(client)
    const listId = await createList(client, owner)

    const other = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/folders')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ name: 'Someone else’s folder' })
    const folderId = bodyData<FolderDto>(create).id

    const file = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner}`)
      .json({ folderId })
    file.assertStatus(404)
  })
})
