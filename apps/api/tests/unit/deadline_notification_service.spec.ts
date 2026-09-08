import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  isNotificationDue,
  notificationBody,
  nowLocalMinuteIso,
  todayLocalIso,
} from '#services/deadline_notification_service'

test.group('todayLocalIso / nowLocalMinuteIso', () => {
  test('formats the local calendar day and minute', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T14:07:00')
    assert.equal(todayLocalIso(now), '2026-09-05')
    assert.equal(nowLocalMinuteIso(now), '2026-09-05T14:07')
  })

  test('pads single-digit month/day/hour/minute', ({ assert }) => {
    const now = DateTime.fromISO('2026-01-02T03:04:00')
    assert.equal(todayLocalIso(now), '2026-01-02')
    assert.equal(nowLocalMinuteIso(now), '2026-01-02T03:04')
  })
})

test.group('isNotificationDue', () => {
  test('datetime deadline: due the minute it passes', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T14:30:00')
    assert.isTrue(isNotificationDue('2026-09-05T14:30', now))
  })

  test('datetime deadline: not yet due before its minute', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T14:29:00')
    assert.isFalse(isNotificationDue('2026-09-05T14:30', now))
  })

  test('datetime deadline: still due within the grace window', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T14:40:00')
    assert.isTrue(isNotificationDue('2026-09-05T14:30', now))
  })

  test('datetime deadline: no longer due once the grace window has passed', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T14:46:00')
    assert.isFalse(isNotificationDue('2026-09-05T14:30', now))
  })

  test('datetime deadline: long overdue (feature just enabled) does not retroactively fire', ({
    assert,
  }) => {
    const now = DateTime.fromISO('2026-09-05T14:30:00')
    assert.isFalse(isNotificationDue('2026-08-01T09:00', now))
  })

  test('date-only deadline: due at 9am on its calendar day, matching the native/Electron default', ({
    assert,
  }) => {
    const now = DateTime.fromISO('2026-09-05T09:00:00')
    assert.isTrue(isNotificationDue('2026-09-05', now))
  })

  test('date-only deadline: not yet due before 9am', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T08:59:00')
    assert.isFalse(isNotificationDue('2026-09-05', now))
  })

  test('date-only deadline: still due within the grace window after 9am', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T09:10:00')
    assert.isTrue(isNotificationDue('2026-09-05', now))
  })

  test('date-only deadline: no longer due once the grace window has passed', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T09:16:00')
    assert.isFalse(isNotificationDue('2026-09-05', now))
  })

  test('date-only deadline: not due on a different day', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T09:00:00')
    assert.isFalse(isNotificationDue('2026-09-06', now))
    assert.isFalse(isNotificationDue('2026-09-04', now))
  })
})

test.group('notificationBody', () => {
  test('returns an empty string when there are no notes', ({ assert }) => {
    assert.equal(notificationBody(null), '')
  })

  test('returns notes unchanged when within the length limit', ({ assert }) => {
    assert.equal(notificationBody('Ask at the front desk'), 'Ask at the front desk')
  })

  test('truncates long notes with an ellipsis', ({ assert }) => {
    const notes = 'a'.repeat(200)
    const result = notificationBody(notes)

    assert.equal(result.length, 150)
    assert.isTrue(result.endsWith('…'))
    assert.isTrue(result.startsWith('a'.repeat(149)))
  })
})
