import { test } from '@japa/runner'
import { groupCategoryLearningsFromItems } from '#services/category_learning_backfill'

test.group('category learning backfill', () => {
  test('groups items by list/category/token, summing count and keeping the max lastSeenAt', ({
    assert,
  }) => {
    const groups = groupCategoryLearningsFromItems([
      { listId: 1, categoryId: 10, name: 'Apples', lastSeenAt: '2026-08-20 10:00:00' },
      { listId: 1, categoryId: 10, name: 'apple', lastSeenAt: '2026-08-21 10:00:00' },
      { listId: 1, categoryId: 11, name: 'Apple Juice', lastSeenAt: '2026-08-22 10:00:00' },
      { listId: 2, categoryId: 10, name: 'Apples', lastSeenAt: '2026-08-23 10:00:00' },
    ])

    const sorted = [...groups].sort(
      (a, b) => a.listId - b.listId || a.categoryId - b.categoryId || a.token.localeCompare(b.token)
    )

    assert.deepEqual(sorted, [
      { listId: 1, categoryId: 10, token: 'apple', count: 2, lastSeenAt: '2026-08-21 10:00:00' },
      { listId: 1, categoryId: 11, token: 'apple', count: 1, lastSeenAt: '2026-08-22 10:00:00' },
      { listId: 1, categoryId: 11, token: 'juice', count: 1, lastSeenAt: '2026-08-22 10:00:00' },
      { listId: 2, categoryId: 10, token: 'apple', count: 1, lastSeenAt: '2026-08-23 10:00:00' },
    ])
  })

  test('keeps the most recent lastSeenAt regardless of item order', ({ assert }) => {
    const groups = groupCategoryLearningsFromItems([
      { listId: 1, categoryId: 10, name: 'Berries', lastSeenAt: '2026-08-24 10:00:00' },
      { listId: 1, categoryId: 10, name: 'berry', lastSeenAt: '2026-08-19 10:00:00' },
    ])

    assert.deepEqual(groups, [
      { listId: 1, categoryId: 10, token: 'berry', count: 2, lastSeenAt: '2026-08-24 10:00:00' },
    ])
  })

  test('skips items whose name tokenizes to nothing', ({ assert }) => {
    const groups = groupCategoryLearningsFromItems([
      { listId: 1, categoryId: 10, name: '123', lastSeenAt: '2026-08-20 10:00:00' },
    ])

    assert.deepEqual(groups, [])
  })
})
