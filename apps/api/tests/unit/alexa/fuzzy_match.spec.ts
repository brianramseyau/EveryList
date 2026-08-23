import { test } from '@japa/runner'
import { closestMatch } from '#services/alexa/fuzzy_match'

const words = ['Milk', 'Bread', 'Eggplant']

test.group('closestMatch', () => {
  test('returns null for an empty query', ({ assert }) => {
    assert.isNull(closestMatch('', words, (w) => w))
  })

  test('returns null with no candidates', ({ assert }) => {
    assert.isNull(closestMatch('milk', [], (w) => w))
  })

  test('matches an exact (case/whitespace-insensitive) name outright', ({ assert }) => {
    assert.equal(
      closestMatch('  MILK  ', words, (w) => w),
      'Milk'
    )
  })

  test('tolerates a near-miss transcription', ({ assert }) => {
    assert.equal(
      closestMatch('miilk', words, (w) => w),
      'Milk'
    )
  })

  test('does not match an unrelated word with a short name', ({ assert }) => {
    assert.isNull(closestMatch('eggs', words, (w) => w))
  })

  test('a candidate outside the tolerance for a longer word is ignored', ({ assert }) => {
    const candidates = ['Bread', 'Bread Rolls']
    assert.equal(
      closestMatch('Bred', candidates, (w) => w),
      'Bread'
    )
  })

  test('a later candidate no closer than the current best does not replace it', ({ assert }) => {
    const candidates = ['abcdY', 'abcde']
    assert.equal(
      closestMatch('abcdX', candidates, (w) => w),
      'abcdY'
    )
  })
})
