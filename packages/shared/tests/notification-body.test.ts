import { describe, expect, it } from 'vitest'
import { notificationBody } from '../src/notification-body.js'

describe('notificationBody', () => {
  it('returns an empty string when there are no notes', () => {
    expect(notificationBody(null)).toBe('')
  })

  it('returns notes unchanged when within the length limit', () => {
    expect(notificationBody('Ask at the front desk')).toBe('Ask at the front desk')
  })

  it('truncates long notes with an ellipsis', () => {
    const notes = 'a'.repeat(200)
    const result = notificationBody(notes)

    expect(result.length).toBe(150)
    expect(result.endsWith('…')).toBe(true)
    expect(result.startsWith('a'.repeat(149))).toBe(true)
  })

  it('drops a surrogate-pair character whole rather than splitting it at the cut point', () => {
    // 149 plain chars + an emoji (2 UTF-16 code units, 1 code point) sitting right at the
    // truncation boundary — string.slice(0, 150) would split the emoji's surrogate pair.
    const notes = 'a'.repeat(149) + '😀' + 'b'.repeat(50)
    const result = notificationBody(notes)

    expect(result).toBe(`${'a'.repeat(149)}…`)
    expect(result.length).toBe(150)
  })
})
