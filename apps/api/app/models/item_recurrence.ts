import { ItemRecurrenceSchema } from '#database/schema'

/**
 * One repeat series — the rule stored once, shared by every item spawned from it via
 * `items.recurrence_id`. See PLAN_30_PHASE_RECURRING_ITEMS.md and
 * `#services/item_recurrence_service` for the row <-> rule conversions.
 */
export default class ItemRecurrence extends ItemRecurrenceSchema {}
