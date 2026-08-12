import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Category from '#models/category'
import DefaultCategorySeeder from '#database/seeders/default_category_seeder'

test.group('Default category seeder', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('seeds the standard aisle categories as global defaults', async ({ assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()

    const categories = await Category.query().where('is_default', true).orderBy('sort_order')

    assert.deepEqual(
      categories.map((category) => category.name),
      ['Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen', 'Pantry', 'Household', 'Other']
    )
    for (const category of categories) {
      assert.isNull(category.listId)
    }
  })

  test('running twice does not create duplicates', async ({ assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    await new DefaultCategorySeeder(db.connection()).run()

    const categories = await Category.query().where('is_default', true)
    assert.lengthOf(categories, 8)
  })
})
