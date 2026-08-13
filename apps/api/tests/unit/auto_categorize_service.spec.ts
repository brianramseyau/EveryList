import { test } from '@japa/runner'
import { suggestCategoryName } from '#services/auto_categorize_service'

test.group('suggestCategoryName', () => {
  test('matches a keyword to its category', ({ assert }) => {
    assert.equal(suggestCategoryName('Bananas'), 'Produce')
  })

  test('prefers the longer of two matching keywords when it is found later', ({ assert }) => {
    // "lime" (Produce) is checked before "cottage cheese" (Dairy); the longer,
    // later match should win the category, not the first one found.
    assert.equal(suggestCategoryName('lime cottage cheese'), 'Dairy')
  })

  test('keeps the first match when a later, shorter keyword also matches', ({ assert }) => {
    // "vegetable" (Produce) is checked before "milk" (Dairy); the shorter,
    // later match should not override the longer first match.
    assert.equal(suggestCategoryName('vegetable milk'), 'Produce')
  })

  test('returns null when nothing matches', ({ assert }) => {
    assert.isNull(suggestCategoryName('xyzzy nonsense'))
  })

  test('returns null for a blank name', ({ assert }) => {
    assert.isNull(suggestCategoryName('   '))
  })
})
