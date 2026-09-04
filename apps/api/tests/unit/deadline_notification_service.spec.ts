import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  isNotificationDue,
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

  test('date-only deadline: due for the whole of its calendar day', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T00:00:00')
    assert.isTrue(isNotificationDue('2026-09-05', now))
    assert.isTrue(isNotificationDue('2026-09-05', now.set({ hour: 23, minute: 59 })))
  })

  test('date-only deadline: not due before or after its day', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-05T12:00:00')
    assert.isFalse(isNotificationDue('2026-09-06', now))
    assert.isFalse(isNotificationDue('2026-09-04', now))
  })
})
