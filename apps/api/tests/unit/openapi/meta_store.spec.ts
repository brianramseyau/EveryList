import { test } from '@japa/runner'
import { MetaStore } from '#services/openapi/meta_store'

test.group('MetaStore', () => {
  test('stores and retrieves per-route operations', ({ assert }) => {
    const store = new MetaStore()
    assert.isUndefined(store.get('lists.items.index'))

    const operation = { tags: ['Items'], summary: 'List items' }
    store.set('lists.items.index', operation)

    assert.deepEqual(store.get('lists.items.index'), operation)
  })

  test('overwrites an existing operation for the same route', ({ assert }) => {
    const store = new MetaStore()
    store.set('metas.show', { summary: 'first' })
    store.set('metas.show', { summary: 'second' })

    assert.deepEqual(store.get('metas.show'), { summary: 'second' })
  })
})
