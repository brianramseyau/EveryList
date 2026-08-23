import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import { resolveList, roleFor } from '#services/alexa/list_resolution'

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

test.group('Alexa list resolution', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('reports not-found when the token has no list grants', async ({ assert }) => {
    const user = await makeUser('none@example.com')
    const token = await User.personalAccessTokens.create(user, [])

    const result = await resolveList(token, undefined)
    assert.equal(result.kind, 'not-found')
  })

  test('reports not-found when every granted list has since been deleted', async ({ assert }) => {
    const user = await makeUser('deleted@example.com')
    const list = await List.create({ name: 'Gone', ownerId: user.id })
    const token = await User.personalAccessTokens.create(user, [`list:${list.id}:editor`])
    list.deletedAt = DateTime.now()
    await list.save()

    const result = await resolveList(token, undefined)
    assert.equal(result.kind, 'not-found')
  })

  test('resolves the single accessible list implicitly with no ListName slot', async ({
    assert,
  }) => {
    const user = await makeUser('single@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const token = await User.personalAccessTokens.create(user, [`list:${list.id}:editor`])

    const result = await resolveList(token, undefined)
    assert.equal(result.kind, 'found')
    assert.equal(result.kind === 'found' && result.list.id, list.id)
  })

  test('asks to disambiguate with several accessible lists and no ListName slot', async ({
    assert,
  }) => {
    const user = await makeUser('multi@example.com')
    const listA = await List.create({ name: 'Groceries', ownerId: user.id })
    const listB = await List.create({ name: 'Hardware', ownerId: user.id })
    const token = await User.personalAccessTokens.create(user, [
      `list:${listA.id}:editor`,
      `list:${listB.id}:viewer`,
    ])

    const result = await resolveList(token, undefined)
    assert.equal(result.kind, 'ambiguous')
    assert.lengthOf(result.kind === 'ambiguous' ? result.options : [], 2)
  })

  test('a ListName slot fuzzy-matches against accessible lists', async ({ assert }) => {
    const user = await makeUser('fuzzy@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const token = await User.personalAccessTokens.create(user, [`list:${list.id}:editor`])

    const result = await resolveList(token, 'groceriez')
    assert.equal(result.kind, 'found')
    assert.equal(result.kind === 'found' && result.list.id, list.id)
  })

  test('a ListName slot with no match reports not-found', async ({ assert }) => {
    const user = await makeUser('nomatch@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const token = await User.personalAccessTokens.create(user, [`list:${list.id}:editor`])

    const result = await resolveList(token, 'Something Else Entirely')
    assert.equal(result.kind, 'not-found')
  })

  test('roleFor returns the granted role, or null when ungranted', async ({ assert }) => {
    const user = await makeUser('role@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const other = await List.create({ name: 'Other', ownerId: user.id })
    const token = await User.personalAccessTokens.create(user, [`list:${list.id}:viewer`])

    assert.equal(roleFor(token, list.id), 'viewer')
    assert.isNull(roleFor(token, other.id))
  })
})
