import { test } from '@japa/runner'
import { renderIcon } from '#services/alexa/icon_renderer'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test.group('renderIcon', () => {
  test('renders a known MDI icon as a PNG', ({ assert }) => {
    const png = renderIcon('basket', 'c2410c')
    assert.isTrue(png.subarray(0, 8).equals(PNG_MAGIC))
  })

  test('falls back to the generic glyph for an unknown icon name, without throwing', ({
    assert,
  }) => {
    const png = renderIcon('notARealIconName', 'c2410c')
    assert.isTrue(png.subarray(0, 8).equals(PNG_MAGIC))
  })

  test('repeat calls for the same icon/color hit the in-process cache', ({ assert }) => {
    const first = renderIcon('cheese', 'edeae3')
    const second = renderIcon('cheese', 'edeae3')
    assert.strictEqual(first, second)
  })

  test("the same icon in a different color is not served from the other color's cache entry", ({
    assert,
  }) => {
    const orange = renderIcon('spray', 'c2410c')
    const blue = renderIcon('spray', '3b82f6')
    assert.notStrictEqual(orange, blue)
  })
})
