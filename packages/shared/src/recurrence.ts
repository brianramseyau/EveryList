/**
 * Repeat rules for items (PLAN_30_PHASE_RECURRING_ITEMS.md). All date math is on naive
 * 'YYYY-MM-DD' calendar dates via UTC day numbers, never `new Date(iso)` in local time, so a
 * server or browser in any timezone computes the same next date (same reasoning as
 * apps/web's deadline.ts). Weekdays are stored as 0 = Sunday .. 6 = Saturday (what `Date#getUTCDay` returns), but weeks
 * start on Monday (ISO 8601) — that only matters for "every N weeks".
 */

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'

/** Month rules: a fixed day of the month, or the Nth (or last, -1) weekday of it. */
export type MonthlyRule =
  | { kind: 'dayOfMonth'; day: number }
  | { kind: 'nthWeekday'; nth: 1 | 2 | 3 | 4 | -1; weekday: number }

export type RecurrenceEnd =
  { type: 'never' } | { type: 'on'; date: string } | { type: 'after'; count: number }

/** What a client submits: the repeat rule itself, with no series bookkeeping. */
export interface RecurrenceRule {
  /** Repeat every `interval` units (>= 1). */
  interval: number
  unit: RecurrenceUnit
  /** Week rules only; empty means "the anchor date's weekday". */
  weekdays: number[]
  /** Month rules only; null means "the anchor date's day of the month". */
  monthly: MonthlyRule | null
  /** 'YYYY-MM-DD' anchor the frequency grid is generated from. */
  startDate: string
  end: RecurrenceEnd
}

/** A stored series: the rule plus which occurrence the newest item in it is. */
export interface RecurrenceDto extends RecurrenceRule {
  id: number
  /** 1-based count of items created in this series so far (the "After N" counter). */
  occurrence: number
}

const MS_PER_DAY = 86_400_000

function parseDate(date: string): [year: number, month: number, day: number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))]
}

function toDayNumber(date: string): number {
  const [year, month, day] = parseDate(date)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

function fromDayNumber(days: number): string {
  const date = new Date(days * MS_PER_DAY)
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  return `${date.getUTCFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`
}

function weekdayOf(days: number): number {
  return new Date(days * MS_PER_DAY).getUTCDay()
}

/** The Monday on or before a day number — the start of its ISO week. */
function mondayOf(days: number): number {
  return days - ((weekdayOf(days) + 6) % 7)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 'YYYY-MM-DD' for `date` shifted by whole days. */
export function addDaysToDate(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days)
}

/** The date of the Nth (1-4) or last (-1) `weekday` in the given month (1-12). */
function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: number): number {
  if (nth === -1) {
    const last = Date.UTC(year, month, 0) / MS_PER_DAY
    return last - ((weekdayOf(last) - weekday + 7) % 7)
  }
  const first = Date.UTC(year, month - 1, 1) / MS_PER_DAY
  return first + ((weekday - weekdayOf(first) + 7) % 7) + (nth - 1) * 7
}

/** The rule's occurrence inside the month `monthIndex` (year * 12 + month - 1), as a day number. */
function monthOccurrence(rule: RecurrenceRule, monthIndex: number, anchorDay: number): number {
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  if (rule.monthly?.kind === 'nthWeekday') {
    return nthWeekdayOfMonth(year, month, rule.monthly.nth, rule.monthly.weekday)
  }
  const day = rule.monthly?.day ?? anchorDay
  return Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))) / MS_PER_DAY
}

/** First day at or after `earliest` that falls on a selected weekday of an active week. */
function weekOccurrence(rule: RecurrenceRule, start: number, earliest: number): number {
  const weekdays = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(start)]
  const startWeek = mondayOf(start)
  const matches = (day: number) =>
    Math.floor((mondayOf(day) - startWeek) / 7) % rule.interval === 0 &&
    weekdays.includes(weekdayOf(day))
  let day = earliest
  while (!matches(day)) day++
  return day
}

/** First occurrence on the rule's grid that is strictly after `after` and not before the anchor. */
function occurrenceAfter(rule: RecurrenceRule, after: string): number {
  const start = toDayNumber(rule.startDate)
  const earliest = Math.max(toDayNumber(after) + 1, start)
  const [startYear, startMonth, startDay] = parseDate(rule.startDate)

  if (rule.unit === 'day') {
    return start + Math.ceil((earliest - start) / rule.interval) * rule.interval
  }

  if (rule.unit === 'week') return weekOccurrence(rule, start, earliest)

  const step = rule.unit === 'month' ? rule.interval : rule.interval * 12
  const startIndex = startYear * 12 + startMonth - 1
  const earliestDate = new Date(earliest * MS_PER_DAY)
  const earliestIndex = earliestDate.getUTCFullYear() * 12 + earliestDate.getUTCMonth()
  let k = Math.max(0, Math.floor((earliestIndex - startIndex) / step))
  for (; ; k++) {
    const monthIndex = startIndex + k * step
    const day =
      rule.unit === 'month'
        ? monthOccurrence(rule, monthIndex, startDay)
        : monthOccurrence({ ...rule, monthly: null }, monthIndex, startDay)
    if (day >= earliest) return day
  }
}

/** The first grid date on or after `date` (and never before the anchor). */
export function occurrenceOnOrAfter(rule: RecurrenceRule, date: string): string {
  return fromDayNumber(occurrenceAfter(rule, addDaysToDate(date, -1)))
}

/** The first date the series lands on: the first grid date on or after its anchor. */
export function firstOccurrence(rule: RecurrenceRule): string {
  return occurrenceOnOrAfter(rule, rule.startDate)
}

/**
 * The date the next item in the series is due, or null when the series is over.
 *
 * `after` is the deadline date of the item just completed; `occurrence` how many items the
 * series has created so far (so "After N" ends once N exist). The next date is the first grid
 * date strictly after `after` — but if that is already in the past (a chore completed long after
 * its due date), it rolls forward to the first grid date on or after `today` so a late completion
 * doesn't spawn an item that is born overdue, or a backlog of them.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  occurrence: number,
  after: string,
  today: string
): string | null {
  if (rule.end.type === 'after' && occurrence >= rule.end.count) return null

  let next = fromDayNumber(occurrenceAfter(rule, after))
  if (next < today) next = fromDayNumber(occurrenceAfter(rule, addDaysToDate(today, -1)))

  if (rule.end.type === 'on' && next > rule.end.date) return null
  return next
}

/** Highest "every N" interval and "after N occurrences" count a rule may carry. */
export const MAX_RECURRENCE_COUNT = 999

/**
 * The first reason a rule is invalid, or null when it's fine. Structural only (unit-specific
 * fields on the wrong unit, out-of-range values, an end date before the anchor) — field shapes
 * and real calendar dates are the caller's own validator's job.
 */
export function recurrenceRuleProblem(rule: RecurrenceRule): string | null {
  if (rule.interval < 1 || rule.interval > MAX_RECURRENCE_COUNT) {
    return `Repeat interval must be between 1 and ${MAX_RECURRENCE_COUNT}`
  }
  if (rule.unit !== 'week' && rule.weekdays.length > 0) {
    return 'Weekdays can only be chosen for a weekly repeat'
  }
  if (rule.weekdays.some((weekday) => weekday < 0 || weekday > 6)) {
    return 'Weekdays must be between 0 (Sunday) and 6 (Saturday)'
  }
  if (rule.unit !== 'month' && rule.monthly !== null) {
    return 'A day of the month can only be chosen for a monthly repeat'
  }
  if (rule.monthly?.kind === 'dayOfMonth' && (rule.monthly.day < 1 || rule.monthly.day > 31)) {
    return 'Day of the month must be between 1 and 31'
  }
  if (
    rule.monthly?.kind === 'nthWeekday' &&
    (rule.monthly.weekday < 0 || rule.monthly.weekday > 6)
  ) {
    return 'Weekday must be between 0 (Sunday) and 6 (Saturday)'
  }
  if (rule.end.type === 'on' && rule.end.date < rule.startDate) {
    return 'The end date cannot be before the start date'
  }
  if (rule.end.type === 'after' && (rule.end.count < 1 || rule.end.count > MAX_RECURRENCE_COUNT)) {
    return `Number of occurrences must be between 1 and ${MAX_RECURRENCE_COUNT}`
  }
  return null
}
