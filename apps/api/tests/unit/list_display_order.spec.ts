import { test } from '@japa/runner'
import { buildFlatDisplayOrder } from '#services/list_display_order'
import type Category from '#models/category'
import type Item from '#models/item'
import type List from '#models/list'

function makeItem(overrides: Partial<Item> & Pick<Item, 'id' | 'name'>): Item {
  return {
    checked: false,
    categoryId: null,
    sortOrder: 0,
    deadline: null,
    ...overrides,
  } as unknown as Item
}

function makeList(overrides: Partial<List>): List {
  return { useCategories: false, itemSortOrder: 'ranked', ...overrides } as unknown as List
}

test.group('buildFlatDisplayOrder deadline sort (PLAN_24)', () => {
  test('orders by deadline ascending, ties by name, no-deadline items last in rank order', ({
    assert,
  }) => {
    const list = makeList({ itemSortOrder: 'deadline' })
    const items = [
      makeItem({ id: 1, name: 'Bravo', deadline: '2026-09-06', sortOrder: 3 }),
      makeItem({ id: 2, name: 'Alpha', deadline: '2026-09-06', sortOrder: 1 }),
      makeItem({ id: 3, name: 'Earlier', deadline: '2026-09-05T09:00', sortOrder: 5 }),
      makeItem({ id: 4, name: 'No deadline later rank', deadline: null, sortOrder: 9 }),
      makeItem({ id: 5, name: 'No deadline earlier rank', deadline: null, sortOrder: 2 }),
    ]

    const ordered = buildFlatDisplayOrder(list, items, [], { includeChecked: true })

    assert.deepEqual(
      ordered.map((item) => item.id),
      [3, 2, 1, 5, 4],
      'earliest deadline first (datetime sorts before same-day date-only), then name tiebreak, then no-deadline items in rank order'
    )
  })

  test('date-only deadlines are not ordered before a same-date time by anything but the string rule', ({
    assert,
  }) => {
    const list = makeList({ itemSortOrder: 'deadline' })
    const items = [
      makeItem({ id: 1, name: 'Evening', deadline: '2026-09-06T20:00', sortOrder: 1 }),
      makeItem({ id: 2, name: 'All day', deadline: '2026-09-06', sortOrder: 2 }),
    ]

    const ordered = buildFlatDisplayOrder(list, items, [], { includeChecked: true })

    // 'YYYY-MM-DD' < 'YYYY-MM-DDTHH:mm' lexicographically — the documented,
    // deterministic tiebreak between the two shapes on one date.
    assert.deepEqual(
      ordered.map((item) => item.id),
      [2, 1]
    )
  })

  test('keeps category clustering and applies the deadline order within each bucket', ({
    assert,
  }) => {
    const list = makeList({ itemSortOrder: 'deadline', useCategories: true })
    const categories = [
      { id: 10, sortOrder: 0 },
      { id: 20, sortOrder: 1 },
    ] as unknown as Category[]
    const items = [
      makeItem({ id: 1, name: 'Cat20 urgent', categoryId: 20, deadline: '2026-09-01' }),
      makeItem({ id: 2, name: 'Cat10 later', categoryId: 10, deadline: '2026-09-05' }),
      makeItem({ id: 3, name: 'Cat10 earlier', categoryId: 10, deadline: '2026-09-02' }),
      makeItem({ id: 4, name: 'Uncategorized', categoryId: null, deadline: '2026-09-03' }),
    ]

    const ordered = buildFlatDisplayOrder(list, items, categories, { includeChecked: true })

    assert.deepEqual(
      ordered.map((item) => item.id),
      [3, 2, 1, 4],
      'category clusters stay in category order (10 then 20, uncategorized last) and each bucket deadline-sorts internally'
    )
  })

  test('a ranked list still ignores deadlines entirely', ({ assert }) => {
    const list = makeList({ itemSortOrder: 'ranked' })
    const items = [
      makeItem({ id: 1, name: 'Later rank, early deadline', deadline: '2026-09-01', sortOrder: 5 }),
      makeItem({ id: 2, name: 'Earlier rank, no deadline', deadline: null, sortOrder: 1 }),
    ]

    const ordered = buildFlatDisplayOrder(list, items, [], { includeChecked: true })

    assert.deepEqual(
      ordered.map((item) => item.id),
      [2, 1]
    )
  })

  test('deadline sort is argument-order independent (null vs non-null both ways)', ({ assert }) => {
    const list = makeList({ itemSortOrder: 'deadline' })
    // Each arrangement forces the comparator to see the null/non-null pair in
    // both argument orders, so neither side of the null checks is dead.
    const nullFirst = [
      makeItem({ id: 1, name: 'No deadline', deadline: null, sortOrder: 1 }),
      makeItem({ id: 2, name: 'Dated', deadline: '2026-09-05', sortOrder: 2 }),
    ]
    const datedFirst = [...nullFirst].reverse()

    assert.deepEqual(
      buildFlatDisplayOrder(list, nullFirst, [], { includeChecked: true }).map((i) => i.id),
      [2, 1]
    )
    assert.deepEqual(
      buildFlatDisplayOrder(list, datedFirst, [], { includeChecked: true }).map((i) => i.id),
      [2, 1]
    )
  })
})
