import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import List from '#models/list'
import Category from '#models/category'
import Item from '#models/item'
import Store from '#models/store'
import ListStore from '#models/list_store'
import FavoriteItem from '#models/favorite_item'
import StoreCategoryOrder from '#models/store_category_order'

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

  test('initials derive from full name, falling back to the email', async ({ assert }) => {
    const named = await User.create({
      fullName: 'Ada Lovelace',
      email: 'ada3@example.com',
      password: 'password123',
    })
    assert.equal(named.initials, 'AL')

    const noFullName = await User.create({
      fullName: null,
      email: 'carol@example.com',
      password: 'password123',
    })
    assert.equal(noFullName.initials, 'CE')

    const singleWordName = await User.create({
      fullName: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
    })
    assert.equal(singleWordName.initials, 'BO')
  })

  test('store, list-store, favorite-item, and store-category-order relations load', async ({
    assert,
  }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'ada4@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    const category = await Category.create({
      name: 'Produce',
      icon: 'fruitCherries',
      listId: list.id,
    })
    const store = await Store.create({ name: 'Walmart', color: '#3b82f6', createdBy: owner.id })
    const listStore = await ListStore.create({ listId: list.id, storeId: store.id })
    const favorite = await FavoriteItem.create({
      userId: owner.id,
      listId: list.id,
      name: 'Milk',
      defaultCategoryId: category.id,
    })
    const storeCategoryOrder = await StoreCategoryOrder.create({
      storeId: store.id,
      categoryId: category.id,
      sortOrder: 0,
    })

    await store.load('creator')
    await store.load('lists')
    await store.load('orderedCategories')
    await store.load('categoryOrders')
    await listStore.load('list')
    await listStore.load('store')
    await favorite.load('user')
    await favorite.load('list')
    await favorite.load('defaultCategory')
    await storeCategoryOrder.load('store')
    await storeCategoryOrder.load('category')
    await category.load('list')
    await category.load('items')
    await list.load('favoriteItems')

    assert.equal(store.creator.id, owner.id)
    assert.lengthOf(store.lists, 1)
    assert.equal(store.lists[0]!.id, list.id)
    assert.lengthOf(store.orderedCategories, 1)
    assert.lengthOf(store.categoryOrders, 1)
    assert.equal(listStore.list.id, list.id)
    assert.equal(listStore.store.id, store.id)
    assert.equal(favorite.user.id, owner.id)
    assert.equal(favorite.list.id, list.id)
    assert.equal(favorite.defaultCategory!.id, category.id)
    assert.equal(storeCategoryOrder.store.id, store.id)
    assert.equal(storeCategoryOrder.category.id, category.id)
    assert.equal(category.list!.id, list.id)
    assert.lengthOf(list.favoriteItems, 1)
    assert.equal(list.favoriteItems[0]!.id, favorite.id)
    assert.lengthOf(category.items, 0)
  })
})
