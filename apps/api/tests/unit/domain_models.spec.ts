import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import List from '#models/list'
import Category from '#models/category'
import Item from '#models/item'

test.group('List/Category/Item domain models', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('a list belongs to its owner and has categories and items', async ({ assert }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
    })

    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    const category = await Category.create({
      name: 'Produce',
      icon: 'fruitCherries',
      listId: list.id,
    })
    const item = await Item.create({
      listId: list.id,
      name: 'Apples',
      categoryId: category.id,
      createdBy: owner.id,
    })

    await list.load('owner')
    await list.load('categories')
    await list.load('items')
    await item.load('list')
    await item.load('category')
    await item.load('creator')
    await item.refresh()

    assert.equal(list.owner.id, owner.id)
    assert.lengthOf(list.categories, 1)
    assert.lengthOf(list.items, 1)
    assert.equal(item.list.id, list.id)
    assert.equal(item.category!.id, category.id)
    assert.equal(item.creator.id, owner.id)
    assert.isFalse(item.checked)
    assert.equal(item.sortOrder, 0)
  })

  test('deleting a list cascades to its categories and items', async ({ assert }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'ada2@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    const category = await Category.create({
      name: 'Produce',
      icon: 'fruitCherries',
      listId: list.id,
    })
    await Item.create({
      listId: list.id,
      name: 'Apples',
      categoryId: category.id,
      createdBy: owner.id,
    })

    await list.delete()

    assert.isNull(await Category.find(category.id))
    assert.lengthOf(await Item.query().where('list_id', list.id), 0)
  })
})
