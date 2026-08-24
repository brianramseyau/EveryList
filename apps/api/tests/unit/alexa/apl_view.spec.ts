import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import Category from '#models/category'
import Item from '#models/item'
import { buildListDisplay, buildIconUrl } from '#services/alexa/apl_view'

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

type Row =
  | { type: 'header'; text: string; iconUrl: string }
  | { type: 'item'; id: number; name: string; checked: boolean }

const DEFAULT_COLOR = '#3b82f6'

function rowsOf(directive: Awaited<ReturnType<typeof buildListDisplay>>): Row[] {
  return directive.datasources.listData.properties.rows as Row[]
}

test.group('buildListDisplay', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('groups items by category in category sortOrder, with unmatched items under "Other"', async ({
    assert,
  }) => {
    const user = await makeUser('display1@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })

    const produce = await Category.create({
      listId: list.id,
      name: 'Produce',
      icon: 'fruitCherries',
      sortOrder: 1,
      isDefault: false,
      version: 1,
    })
    const dairy = await Category.create({
      listId: list.id,
      name: 'Dairy',
      icon: 'cheese',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const apples = await Item.create({
      listId: list.id,
      name: 'Apples',
      categoryId: produce.id,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const milk = await Item.create({
      listId: list.id,
      name: 'Milk',
      categoryId: dairy.id,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const batteries = await Item.create({
      listId: list.id,
      name: 'Batteries',
      categoryId: null,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    const directive = await buildListDisplay(list)
    assert.equal(directive.type, 'Alexa.Presentation.APL.RenderDocument')
    assert.isTrue(directive.token.startsWith(`list-${list.id}-`))
    assert.equal(directive.datasources.listData.properties.listName, 'Groceries')
    assert.equal(directive.datasources.listData.properties.listColor, DEFAULT_COLOR)
    assert.equal(directive.datasources.listData.properties.listIconUrl, '')

    // Dairy (sortOrder 0) before Produce (sortOrder 1), "Other" last.
    assert.deepEqual(rowsOf(directive), [
      { type: 'header', text: 'Dairy', iconUrl: buildIconUrl('cheese', DEFAULT_COLOR) },
      { type: 'item', id: milk.id, name: 'Milk', checked: false },
      { type: 'header', text: 'Produce', iconUrl: buildIconUrl('fruitCherries', DEFAULT_COLOR) },
      { type: 'item', id: apples.id, name: 'Apples', checked: false },
      {
        type: 'header',
        text: 'Other',
        iconUrl: buildIconUrl('dotsHorizontalCircle', DEFAULT_COLOR),
      },
      { type: 'item', id: batteries.id, name: 'Batteries', checked: false },
    ])
  })

  test('within a category, unchecked items come before checked ones', async ({ assert }) => {
    const user = await makeUser('display2@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const category = await Category.create({
      listId: list.id,
      name: 'Pantry',
      icon: 'foodCanArrowUp',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const checkedFirst = await Item.create({
      listId: list.id,
      name: 'Rice',
      categoryId: category.id,
      checked: true,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const uncheckedSecond = await Item.create({
      listId: list.id,
      name: 'Pasta',
      categoryId: category.id,
      checked: false,
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })

    const directive = await buildListDisplay(list)
    assert.deepEqual(rowsOf(directive), [
      { type: 'header', text: 'Pantry', iconUrl: buildIconUrl('foodCanArrowUp', DEFAULT_COLOR) },
      { type: 'item', id: uncheckedSecond.id, name: 'Pasta', checked: false },
      { type: 'item', id: checkedFirst.id, name: 'Rice', checked: true },
    ])
  })

  test('within a category, unchecked items come before checked ones even when the checked item has the lower sortOrder', async ({
    assert,
  }) => {
    const user = await makeUser('display6@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const category = await Category.create({
      listId: list.id,
      name: 'Pantry',
      icon: 'foodCanArrowUp',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const uncheckedFirst = await Item.create({
      listId: list.id,
      name: 'Pasta',
      categoryId: category.id,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const checkedSecond = await Item.create({
      listId: list.id,
      name: 'Rice',
      categoryId: category.id,
      checked: true,
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })

    const directive = await buildListDisplay(list)
    assert.deepEqual(rowsOf(directive), [
      { type: 'header', text: 'Pantry', iconUrl: buildIconUrl('foodCanArrowUp', DEFAULT_COLOR) },
      { type: 'item', id: uncheckedFirst.id, name: 'Pasta', checked: false },
      { type: 'item', id: checkedSecond.id, name: 'Rice', checked: true },
    ])
  })

  test('within the same checked state, items are ordered by sortOrder', async ({ assert }) => {
    const user = await makeUser('display5@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const category = await Category.create({
      listId: list.id,
      name: 'Pantry',
      icon: 'foodCanArrowUp',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const second = await Item.create({
      listId: list.id,
      name: 'Pasta',
      categoryId: category.id,
      checked: false,
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })
    const first = await Item.create({
      listId: list.id,
      name: 'Beans',
      categoryId: category.id,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    const directive = await buildListDisplay(list)
    assert.deepEqual(rowsOf(directive), [
      { type: 'header', text: 'Pantry', iconUrl: buildIconUrl('foodCanArrowUp', DEFAULT_COLOR) },
      { type: 'item', id: first.id, name: 'Beans', checked: false },
      { type: 'item', id: second.id, name: 'Pasta', checked: false },
    ])
  })

  test('a category with no active items is omitted entirely', async ({ assert }) => {
    const user = await makeUser('display3@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    await Category.create({
      listId: list.id,
      name: 'Empty Category',
      icon: 'tag',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const directive = await buildListDisplay(list)
    assert.deepEqual(rowsOf(directive), [])
  })

  test('a deleted item never appears', async ({ assert }) => {
    const user = await makeUser('display4@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: user.id })

    await Item.create({
      listId: list.id,
      name: 'Gone',
      categoryId: null,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
      deletedAt: DateTime.now(),
    })

    const directive = await buildListDisplay(list)
    assert.deepEqual(rowsOf(directive), [])
  })

  test('a list with a custom icon and color renders a tinted listIconUrl', async ({ assert }) => {
    const user = await makeUser('display7@example.com')
    const list = await List.create({
      name: 'Hardware',
      ownerId: user.id,
      icon: 'basket',
      color: '#c2410c',
    })

    const directive = await buildListDisplay(list)
    assert.equal(
      directive.datasources.listData.properties.listIconUrl,
      buildIconUrl('basket', '#c2410c')
    )
  })
})

test.group('buildIconUrl', () => {
  test('strips a leading # from the color before building the query string', ({ assert }) => {
    assert.equal(buildIconUrl('basket', '#c2410c'), buildIconUrl('basket', 'c2410c'))
    assert.include(buildIconUrl('basket', '#c2410c'), 'color=c2410c')
    assert.include(buildIconUrl('basket', '#c2410c'), '/api/v1/alexa/icons/basket')
  })
})
