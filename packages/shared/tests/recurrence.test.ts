import { describe, expect, it } from 'vitest'
import {
  addDaysToDate,
  firstOccurrence,
  nextOccurrence,
  occurrenceOnOrAfter,
  recurrenceRuleProblem,
  type RecurrenceRule
} from '../src/recurrence.js'

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    interval: 1,
    unit: 'day',
    weekdays: [],
    monthly: null,
    startDate: '2026-01-01',
    end: { type: 'never' },
    ...overrides
  }
}

// A far-past "today" so the roll-forward never interferes unless a test wants it to.
const LONG_AGO = '2000-01-01'

describe('addDaysToDate', () => {
  it('crosses month and year boundaries', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('day rules', () => {
  it('repeats every day', () => {
    expect(nextOccurrence(rule({}), 1, '2026-01-01', LONG_AGO)).toBe('2026-01-02')
  })

  it('keeps to the anchor grid for intervals above one', () => {
    const every3 = rule({ interval: 3 })
    expect(nextOccurrence(every3, 1, '2026-01-01', LONG_AGO)).toBe('2026-01-04')
    // A completed item due off-grid still snaps to the next grid date.
    expect(nextOccurrence(every3, 1, '2026-01-02', LONG_AGO)).toBe('2026-01-04')
  })

  it('never lands before the anchor', () => {
    expect(nextOccurrence(rule({ startDate: '2026-06-10' }), 1, '2026-01-01', LONG_AGO)).toBe(
      '2026-06-10'
    )
  })
})

describe('week rules', () => {
  it("defaults to the anchor's weekday", () => {
    // 2026-01-01 is a Thursday.
    expect(nextOccurrence(rule({ unit: 'week' }), 1, '2026-01-01', LONG_AGO)).toBe('2026-01-08')
  })

  it('walks the selected weekdays within a week', () => {
    const monThu = rule({ unit: 'week', weekdays: [1, 4] })
    expect(nextOccurrence(monThu, 1, '2026-01-01', LONG_AGO)).toBe('2026-01-05')
    expect(nextOccurrence(monThu, 1, '2026-01-05', LONG_AGO)).toBe('2026-01-08')
  })

  it('skips whole weeks for intervals above one', () => {
    // Anchor week is Mon 2025-12-29..Sun 2026-01-04; every 2 weeks on Mon/Thu.
    const biweekly = rule({ unit: 'week', interval: 2, weekdays: [1, 4] })
    expect(nextOccurrence(biweekly, 1, '2026-01-01', LONG_AGO)).toBe('2026-01-12')
    expect(nextOccurrence(biweekly, 1, '2026-01-12', LONG_AGO)).toBe('2026-01-15')
  })
})

describe('week rules (ISO weeks start on Monday)', () => {
  it('keeps Sunday with the Monday-to-Sunday week it ends', () => {
    // Every 2 weeks on Sun + Mon, anchored on Monday 2026-01-05: Sunday 01-11 is in the same
    // active week as that Monday, so the pair is six days apart, then the next active week is 01-19.
    const sunMon = rule({ unit: 'week', interval: 2, weekdays: [0, 1], startDate: '2026-01-05' })
    expect(nextOccurrence(sunMon, 1, '2026-01-05', LONG_AGO)).toBe('2026-01-11')
    expect(nextOccurrence(sunMon, 1, '2026-01-11', LONG_AGO)).toBe('2026-01-19')
    expect(nextOccurrence(sunMon, 1, '2026-01-19', LONG_AGO)).toBe('2026-01-25')
  })
})

describe('month rules', () => {
  it("defaults to the anchor's day of the month", () => {
    const monthly = rule({ unit: 'month', startDate: '2026-01-15' })
    expect(nextOccurrence(monthly, 1, '2026-01-15', LONG_AGO)).toBe('2026-02-15')
  })

  it('clamps a day beyond the end of a short month', () => {
    const on31 = rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 31 } })
    expect(nextOccurrence(on31, 1, '2026-01-31', LONG_AGO)).toBe('2026-02-28')
    expect(nextOccurrence(on31, 1, '2026-02-28', LONG_AGO)).toBe('2026-03-31')
  })

  it('repeats every N months', () => {
    const quarterly = rule({ unit: 'month', interval: 3, startDate: '2026-01-21' })
    expect(nextOccurrence(quarterly, 1, '2026-01-21', LONG_AGO)).toBe('2026-04-21')
  })

  it('finds the Nth weekday of a month', () => {
    const secondTue = rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: 2, weekday: 2 } })
    expect(nextOccurrence(secondTue, 1, '2026-01-01', LONG_AGO)).toBe('2026-01-13')
    expect(nextOccurrence(secondTue, 1, '2026-01-13', LONG_AGO)).toBe('2026-02-10')
  })

  it('finds the last weekday of a month', () => {
    const lastFri = rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: -1, weekday: 5 } })
    expect(nextOccurrence(lastFri, 1, '2026-01-01', LONG_AGO)).toBe('2026-01-30')
    expect(nextOccurrence(lastFri, 1, '2026-01-30', LONG_AGO)).toBe('2026-02-27')
    // 2026-05-31 is a Sunday, so the month ends on the target weekday itself.
    const lastSun = rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: -1, weekday: 0 } })
    expect(nextOccurrence(lastSun, 1, '2026-04-26', LONG_AGO)).toBe('2026-05-31')
  })

  it('moves to the following month once this months occurrence has passed', () => {
    const first = rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 1 } })
    expect(nextOccurrence(first, 1, '2026-01-20', LONG_AGO)).toBe('2026-02-01')
  })
})

describe('year rules', () => {
  it('repeats on the anchor month and day', () => {
    const yearly = rule({ unit: 'year', startDate: '2026-03-09' })
    expect(nextOccurrence(yearly, 1, '2026-03-09', LONG_AGO)).toBe('2027-03-09')
  })

  it('repeats every N years and clamps Feb 29', () => {
    const leap = rule({ unit: 'year', interval: 2, startDate: '2024-02-29' })
    expect(nextOccurrence(leap, 1, '2024-02-29', LONG_AGO)).toBe('2026-02-28')
    expect(nextOccurrence(leap, 1, '2026-02-28', LONG_AGO)).toBe('2028-02-29')
  })
})

describe('end rules', () => {
  it('stops once the "after" count of items exists', () => {
    const twice = rule({ end: { type: 'after', count: 2 } })
    expect(nextOccurrence(twice, 1, '2026-01-01', LONG_AGO)).toBe('2026-01-02')
    expect(nextOccurrence(twice, 2, '2026-01-02', LONG_AGO)).toBeNull()
  })

  it('stops after the end date but allows it exactly', () => {
    const until = rule({ end: { type: 'on', date: '2026-01-03' } })
    expect(nextOccurrence(until, 1, '2026-01-02', LONG_AGO)).toBe('2026-01-03')
    expect(nextOccurrence(until, 1, '2026-01-03', LONG_AGO)).toBeNull()
  })
})

describe('late completion', () => {
  it('rolls forward to the first grid date on or after today', () => {
    expect(nextOccurrence(rule({}), 1, '2026-01-01', '2026-01-10')).toBe('2026-01-10')
    // Thursdays.
    expect(nextOccurrence(rule({ unit: 'week' }), 1, '2026-01-01', '2026-01-10')).toBe('2026-01-15')
  })

  it('applies the end date to the rolled-forward date', () => {
    const until = rule({ end: { type: 'on', date: '2026-01-05' } })
    expect(nextOccurrence(until, 1, '2026-01-01', '2026-01-10')).toBeNull()
  })
})

describe('firstOccurrence', () => {
  it('is the anchor when it is on the grid', () => {
    expect(firstOccurrence(rule({ startDate: '2026-01-05' }))).toBe('2026-01-05')
  })

  it('is the next selected weekday when the anchor is not', () => {
    // 2026-01-01 is a Thursday; the rule wants Mondays.
    expect(firstOccurrence(rule({ unit: 'week', weekdays: [1] }))).toBe('2026-01-05')
  })
})

describe('recurrenceRuleProblem', () => {
  it('accepts a valid rule of every shape', () => {
    expect(recurrenceRuleProblem(rule({}))).toBeNull()
    expect(recurrenceRuleProblem(rule({ unit: 'week', weekdays: [1, 4] }))).toBeNull()
    expect(
      recurrenceRuleProblem(
        rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: -1, weekday: 5 } })
      )
    ).toBeNull()
    expect(
      recurrenceRuleProblem(rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 21 } }))
    ).toBeNull()
    expect(recurrenceRuleProblem(rule({ end: { type: 'on', date: '2026-01-01' } }))).toBeNull()
    expect(recurrenceRuleProblem(rule({ end: { type: 'after', count: 3 } }))).toBeNull()
  })

  it('rejects bad values', () => {
    expect(recurrenceRuleProblem(rule({ interval: 0 }))).toMatch(/interval/)
    expect(recurrenceRuleProblem(rule({ interval: 1000 }))).toMatch(/interval/)
    expect(recurrenceRuleProblem(rule({ weekdays: [1] }))).toMatch(/weekly/)
    expect(recurrenceRuleProblem(rule({ unit: 'week', weekdays: [7] }))).toMatch(/Weekdays/)
    expect(recurrenceRuleProblem(rule({ monthly: { kind: 'dayOfMonth', day: 1 } }))).toMatch(
      /monthly/
    )
    expect(
      recurrenceRuleProblem(rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 32 } }))
    ).toMatch(/Day of the month/)
    expect(
      recurrenceRuleProblem(
        rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: 1, weekday: 9 } })
      )
    ).toMatch(/Weekday/)
    expect(recurrenceRuleProblem(rule({ end: { type: 'on', date: '2025-12-31' } }))).toMatch(
      /end date/
    )
    expect(recurrenceRuleProblem(rule({ end: { type: 'after', count: 0 } }))).toMatch(/occurrences/)
    expect(recurrenceRuleProblem(rule({ end: { type: 'after', count: 1000 } }))).toMatch(
      /occurrences/
    )
  })

  it('rejects an empty or impossible start or end date', () => {
    expect(recurrenceRuleProblem(rule({ startDate: '' }))).toMatch(/start date/)
    expect(recurrenceRuleProblem(rule({ startDate: '2026-02-31' }))).toMatch(/start date/)
    expect(recurrenceRuleProblem(rule({ end: { type: 'on', date: '' } }))).toMatch(/end date/)
  })

  it('rejects fractions and NaN', () => {
    expect(recurrenceRuleProblem(rule({ interval: 2.5 }))).toMatch(/whole number/)
    expect(recurrenceRuleProblem(rule({ interval: NaN }))).toMatch(/whole number/)
    expect(recurrenceRuleProblem(rule({ unit: 'week', weekdays: [1.5] }))).toMatch(/Weekdays/)
    expect(
      recurrenceRuleProblem(rule({ unit: 'month', monthly: { kind: 'dayOfMonth', day: 1.5 } }))
    ).toMatch(/whole number/)
    expect(recurrenceRuleProblem(rule({ end: { type: 'after', count: 2.5 } }))).toMatch(
      /whole number/
    )
  })

  it('rejects a week-of-month that is not first to fourth or last', () => {
    for (const nth of [0, 5, -2]) {
      expect(
        recurrenceRuleProblem(
          rule({ unit: 'month', monthly: { kind: 'nthWeekday', nth: nth as 1, weekday: 1 } })
        )
      ).toMatch(/week of the month/)
    }
  })
})

describe('occurrenceOnOrAfter', () => {
  it('returns the date itself when it is on the grid', () => {
    expect(occurrenceOnOrAfter(rule({ unit: 'week' }), '2026-01-08')).toBe('2026-01-08')
  })

  it('snaps forward to the next grid date, never before the anchor', () => {
    expect(occurrenceOnOrAfter(rule({ unit: 'week' }), '2026-01-09')).toBe('2026-01-15')
    expect(occurrenceOnOrAfter(rule({ startDate: '2026-06-10' }), '2026-01-01')).toBe('2026-06-10')
  })
})
