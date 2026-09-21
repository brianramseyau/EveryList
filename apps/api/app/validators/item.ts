import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

// Item deadlines are naive-local ISO 8601: 'YYYY-MM-DD' (date only, due by
// end of that day) or 'YYYY-MM-DDTHH:mm' (minute precision, no seconds —
// see foundational/PLAN_24_PHASE_ITEM_DEADLINES.md). The regex fixes the
// shape; the rule below re-parses with Luxon and round-trips so calendar-
// impossible values (2026-02-31) and out-of-range times (T25:00, T14:61)
// are rejected too, not just malformed ones.
export const DEADLINE_SHAPE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

// Runs after the shape regex, so `value` is always a well-formed deadline
// string here — the rule only adds the calendar-reality check.
const calendarDeadline = vine.createRule((value, _options, field) => {
  const deadline = value as string
  const parsed = DateTime.fromISO(deadline, { zone: 'utc' })
  const normalized = !parsed.isValid
    ? null
    : deadline.length === 10
      ? parsed.toISODate()
      : parsed.toISO({ includeOffset: false, suppressSeconds: true, suppressMilliseconds: true })
  if (normalized !== deadline) {
    field.report(
      'The deadline must be a real calendar date (YYYY-MM-DD) optionally followed by a valid time (YYYY-MM-DDTHH:mm)',
      'calendarDeadline',
      field
    )
  }
})

// The repeat rule (PLAN_30_PHASE_RECURRING_ITEMS.md). Only shapes and calendar-real dates are
// checked here; cross-field rules (a monthly `kind` needs its own fields, an end type needs its
// date/count, unit-specific fields only on their unit) are `ruleFromPayload`'s job so the
// message names the actual problem.
const recurrenceRule = vine.object({
  interval: vine.number().withoutDecimals().range([1, 999]),
  unit: vine.enum(['day', 'week', 'month', 'year'] as const),
  weekdays: vine.array(vine.number().withoutDecimals().range([0, 6])).maxLength(7),
  monthly: vine
    .object({
      kind: vine.enum(['dayOfMonth', 'nthWeekday'] as const),
      day: vine.number().withoutDecimals().range([1, 31]).nullable().optional(),
      // 1-4 or -1 (last); the cross-field check in `recurrenceRuleProblem` enforces the exact set.
      nth: vine.number().withoutDecimals().range([-1, 4]).nullable().optional(),
      weekday: vine.number().withoutDecimals().range([0, 6]).nullable().optional(),
    })
    .nullable()
    .optional(),
  startDate: vine
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .use(calendarDeadline()),
  end: vine.object({
    type: vine.enum(['never', 'on', 'after'] as const),
    date: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .use(calendarDeadline())
      .nullable()
      .optional(),
    count: vine.number().withoutDecimals().range([1, 999]).nullable().optional(),
  }),
})

export const createItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200),
  quantity: vine.string().trim().maxLength(50).nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  categoryId: vine.number().positive().nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  price: vine.number().min(0).nullable().optional(),
  deadline: vine
    .string()
    .trim()
    .regex(DEADLINE_SHAPE)
    .use(calendarDeadline())
    .nullable()
    .optional(),
  recurrence: recurrenceRule.clone().nullable().optional(),
})

export const updateItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200).optional(),
  quantity: vine.string().trim().maxLength(50).nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  categoryId: vine.number().positive().nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  price: vine.number().min(0).nullable().optional(),
  deadline: vine
    .string()
    .trim()
    .regex(DEADLINE_SHAPE)
    .use(calendarDeadline())
    .nullable()
    .optional(),
  recurrence: recurrenceRule.clone().nullable().optional(),
  checked: vine.boolean().optional(),
  sortOrder: vine.number().optional(),
  expectedVersion: vine.number().optional(),
})

export const importItemsValidator = vine.create({
  text: vine.string().trim().minLength(1).maxLength(20_000),
})

export const moveItemValidator = vine.create({
  // The item this one should be placed immediately after — omitted/null moves it to the front
  // of the list. See ItemsController#move.
  previousItemId: vine.number().positive().nullable().optional(),
  expectedVersion: vine.number().optional(),
})

export const moveItemToListValidator = vine.create({
  destinationListId: vine.number().positive(),
  expectedVersion: vine.number().optional(),
})
