import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  nextOccurrence,
  recurrenceRuleProblem,
  type MonthlyRule,
  type RecurrenceDto,
  type RecurrenceEnd,
  type RecurrenceRule,
  type RecurrenceUnit,
} from '@everylist/shared'
import Item from '#models/item'
import ItemRecurrence from '#models/item_recurrence'
import SubItem from '#models/sub_item'

/** The loosely-typed shape `createItemValidator`/`updateItemValidator` produce for `recurrence`. */
export interface RecurrencePayload {
  interval: number
  unit: RecurrenceUnit
  weekdays: number[]
  monthly?: {
    kind: 'dayOfMonth' | 'nthWeekday'
    day?: number | null
    nth?: number | null
    weekday?: number | null
  } | null
  startDate: string
  end: { type: 'never' | 'on' | 'after'; date?: string | null; count?: number | null }
}

function monthlyFromRow(row: ItemRecurrence): MonthlyRule | null {
  if (row.monthNth !== null && row.monthWeekday !== null) {
    return {
      kind: 'nthWeekday',
      nth: row.monthNth as 1 | 2 | 3 | 4 | -1,
      weekday: row.monthWeekday,
    }
  }
  if (row.monthDay !== null) return { kind: 'dayOfMonth', day: row.monthDay }
  return null
}

function endFromRow(row: ItemRecurrence): RecurrenceEnd {
  if (row.endType === 'on') return { type: 'on', date: row.endDate as string }
  if (row.endType === 'after') return { type: 'after', count: row.endCount as number }
  return { type: 'never' }
}

/** The stored series as the rule the shared date math consumes. */
export function ruleFromRow(row: ItemRecurrence): RecurrenceRule {
  return {
    interval: row.interval,
    unit: row.unit as RecurrenceUnit,
    weekdays: JSON.parse(row.weekdays) as number[],
    monthly: monthlyFromRow(row),
    startDate: row.startDate,
    end: endFromRow(row),
  }
}

/** The stored series as the DTO clients receive on `ItemDto.recurrence`. */
export function recurrenceDto(row: ItemRecurrence): RecurrenceDto {
  return { ...ruleFromRow(row), id: row.id, occurrence: row.occurrencesCreated }
}

/**
 * Turns a validated payload into a rule, or the first reason it isn't one. The validator only
 * checks shapes; the cross-field rules (a monthly `kind` needs its own fields, an end type needs
 * its date/count, unit-specific fields only on their unit) live here and in
 * `recurrenceRuleProblem`.
 */
export function ruleFromPayload(
  payload: RecurrencePayload
): { rule: RecurrenceRule } | { problem: string } {
  let monthly: MonthlyRule | null = null
  if (payload.monthly?.kind === 'dayOfMonth') {
    if (typeof payload.monthly.day !== 'number')
      return { problem: 'A day of the month is required' }
    monthly = { kind: 'dayOfMonth', day: payload.monthly.day }
  } else if (payload.monthly?.kind === 'nthWeekday') {
    const { nth, weekday } = payload.monthly
    if (![1, 2, 3, 4, -1].includes(nth as number) || typeof weekday !== 'number') {
      return { problem: 'A week of the month (1-4 or -1 for last) and a weekday are required' }
    }
    monthly = { kind: 'nthWeekday', nth: nth as 1 | 2 | 3 | 4 | -1, weekday }
  }

  let end: RecurrenceEnd = { type: 'never' }
  if (payload.end.type === 'on') {
    if (!payload.end.date) return { problem: 'An end date is required' }
    end = { type: 'on', date: payload.end.date }
  } else if (payload.end.type === 'after') {
    if (typeof payload.end.count !== 'number') {
      return { problem: 'A number of occurrences is required' }
    }
    end = { type: 'after', count: payload.end.count }
  }

  const rule: RecurrenceRule = {
    interval: payload.interval,
    unit: payload.unit,
    weekdays: [...new Set(payload.weekdays)].sort((a, b) => a - b),
    monthly,
    startDate: payload.startDate,
    end,
  }
  const problem = recurrenceRuleProblem(rule)
  return problem ? { problem } : { rule }
}

/** Copies `rule` onto a series row's columns (leaves `occurrencesCreated` alone). */
export function assignRule(row: ItemRecurrence, rule: RecurrenceRule): void {
  row.interval = rule.interval
  row.unit = rule.unit
  row.weekdays = JSON.stringify(rule.weekdays)
  row.monthDay = rule.monthly?.kind === 'dayOfMonth' ? rule.monthly.day : null
  row.monthNth = rule.monthly?.kind === 'nthWeekday' ? rule.monthly.nth : null
  row.monthWeekday = rule.monthly?.kind === 'nthWeekday' ? rule.monthly.weekday : null
  row.startDate = rule.startDate
  row.endType = rule.end.type
  row.endDate = rule.end.type === 'on' ? rule.end.date : null
  row.endCount = rule.end.type === 'after' ? rule.end.count : null
}

/**
 * Creates or updates `item`'s series from `rule` and points the item at it (the caller saves the
 * item). An item that already has a series updates that shared row in place — only one open item
 * per series exists, so the edit naturally applies to every future spawn.
 */
export async function upsertRecurrence(item: Item, rule: RecurrenceRule): Promise<void> {
  const row = item.recurrenceId
    ? await ItemRecurrence.findOrFail(item.recurrenceId)
    : new ItemRecurrence()
  assignRule(row, rule)
  if (!item.recurrenceId) row.occurrencesCreated = 1
  await row.save()
  item.recurrenceId = row.id
}

/**
 * The next due date for a just-completed recurring item, or null when it doesn't repeat any
 * further (no series, no deadline, or the series' end was reached). `today` is the server's local
 * calendar day.
 */
export async function nextDueDate(item: Item, today: string): Promise<string | null> {
  if (!item.recurrenceId || !item.deadline) return null
  const series = await ItemRecurrence.findOrFail(item.recurrenceId)
  return nextOccurrence(
    ruleFromRow(series),
    series.occurrencesCreated,
    item.deadline.slice(0, 10),
    today
  )
}

/**
 * Creates the next item in `item`'s series: same name/quantity/notes/category/store/price and
 * sub-tasks (reset to unchecked), due `nextDate` at the same time of day, unchecked. Runs on the
 * caller's transaction so the checked row, the copy and the series counter commit together.
 */
export async function spawnNextItem(
  item: Item,
  nextDate: string,
  sortOrder: number,
  trx: TransactionClientContract
): Promise<Item> {
  const copy = await Item.create(
    {
      listId: item.listId,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      categoryId: item.categoryId,
      storeId: item.storeId,
      price: item.price,
      deadline: nextDate + (item.deadline as string).slice(10),
      recurrenceId: item.recurrenceId,
      checked: false,
      sortOrder,
      createdBy: item.createdBy,
      version: 1,
    },
    { client: trx }
  )

  const subItems = await SubItem.query({ client: trx })
    .where('itemId', item.id)
    .orderBy('sortOrder', 'asc')
  for (const subItem of subItems) {
    await SubItem.create(
      {
        itemId: copy.id,
        name: subItem.name,
        checked: false,
        sortOrder: subItem.sortOrder,
        createdBy: subItem.createdBy,
        version: 1,
      },
      { client: trx }
    )
  }

  await ItemRecurrence.query({ client: trx })
    .where('id', item.recurrenceId as number)
    .increment('occurrences_created', 1)
  return copy
}
