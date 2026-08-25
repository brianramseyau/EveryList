import { test } from '@japa/runner'
import { presence, toMb } from '#services/debug_info'

test.group('toMb', () => {
  test('rounds bytes to one decimal place of MB', ({ assert }) => {
    assert.equal(toMb(52_428_800), 50)
    assert.equal(toMb(1_234_567), 1.2)
  })
})

test.group('presence', () => {
  test('reports "set" for a configured value', ({ assert }) => {
    assert.equal(presence('hunter2'), 'set')
  })

  test('reports "not set" for an undefined value', ({ assert }) => {
    assert.equal(presence(undefined), 'not set')
  })
})
