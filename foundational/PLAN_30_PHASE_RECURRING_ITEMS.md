# Phase 30 — Recurring items (Google Tasks–style repeat)

## Context

Chores can't be moved over from Google Tasks because items only have a one-off `deadline`
([PLAN_24](PLAN_24_PHASE_ITEM_DEADLINES.md)). This phase adds a repeat rule to items so a chore
can come back on a schedule: "Repeat every `<n>` `<day|week|month|year>`", weekday selection for
weeks, day-of-month or "First/Second/Third/Fourth/Last + weekday" for months, a "Starts" anchor
date, and an end (Never / On a date / After N occurrences). Time of day reuses the deadline's
existing time part, so every unit supports a time.

Decisions:

- **Completing a recurring item spawns the next item.** The checked row stays as history and a
  copy with the next deadline is created (Google Tasks' behavior).
- **Offered on any list with `useDeadline`** — no separate list toggle. This is a UI scope only: the
  server accepts a rule on any item that has a deadline, exactly as it accepts the `deadline` field
  itself regardless of the flag.
- **Recurrence only** — no Google Tasks importer.

## Data model

New table `item_recurrences` (one row per series, the rule stored once) plus a nullable
`items.recurrence_id`. Every item spawned from a series shares the same `recurrence_id`.

`item_recurrences`: `id` (no `list_id` — it's item-level config; access control always goes
through the item → list), `interval` (>= 1), `unit` (`day|week|month|year`), `weekdays` (JSON text
of 0–6, week only; empty = the anchor's weekday), `month_day` (1–31), `month_nth` (1–4 or -1 for
last) + `month_weekday` (0–6) — a month rule uses either a day-of-month or nth+weekday, both null
= the anchor's day — `start_date` (`YYYY-MM-DD` anchor), `end_type` (`never|on|after`), `end_date`,
`end_count`, `occurrences_created` (counter, 1 for the first item), timestamps.

`items.recurrence_id` is a real FK: `.references('id').inTable('item_recurrences').onDelete('SET NULL')`.
Adding an inline-FK column to `items` makes SQLite rebuild the table (the AGENTS.md
"`ALTER TABLE` + `foreign_keys=ON`" incident), but that was fixed at the root —
`config/database.ts` leaves `foreign_keys` OFF for the `console` environment, where boot
migrations run. Because `items` has CASCADE children (`sub_items`, …) the migration is still
reproduced against a seeded SQLite file before merging (build the pre-migration schema, seed
lists/items/sub_items, run only this migration, confirm every child row survives).

Behavior:

- Removing the repeat config on the current item nulls only that item's `recurrence_id`; older
  checked siblings keep pointing at the series as history.
- Deleting/purging items never touches the series row. A sweep in `prune_service` deletes series
  no item references any more (SET NULL covers any stragglers).
- Re-adding a repeat to an item creates a fresh series (fresh counter).

`RecurrenceRule` / `RecurrenceDto` live in `packages/shared/src/recurrence.ts` and
`ItemDto.recurrence` embeds the DTO (`id`, the rule, `occurrence`). The API preloads the
relation like `subItems`, so the offline Dexie row carries the whole rule and no new routes or
sync entity are needed.

## Recurrence semantics

- Weekdays are stored as 0 = Sunday … 6 = Saturday, but weeks start on Monday (ISO 8601 — this
  only matters for "every N weeks") and the editor lists Mon–Sun. All date math is on naive
  `YYYY-MM-DD` values via UTC day numbers — never a local-time `Date` parse.
- "Every N units" is anchored to `startDate`: the grid is start, start + N, start + 2N …
  (weeks: whole weeks from the anchor's week). Occurrences never land before the anchor.
- "Day 31" (or 29/30) in a shorter month clamps to that month's last day; Feb 29 yearly clamps to
  Feb 28 in non-leap years.
- `nextOccurrence(rule, occurrence, after, today)`: the first grid date strictly after the
  completed item's deadline. If that is already past (a chore completed long after it was due), it
  rolls forward to the first grid date on or after `today`, so a late completion doesn't spawn an
  item that is born overdue. Returns `null` when the series is over (`after` count reached, or the
  next date is past the `on` end date).
- `firstOccurrence(rule)`: the first grid date on or after the anchor — the client uses it as the
  item's deadline when a repeat is saved.

## Backend

1. Migration `<ts>_create_item_recurrences_table.ts` (createTable first, then the
   `recurrence_id` FK column on `items`); `ItemRecurrence` model; `Item` relation; regenerated
   `database/schema.ts`.
2. `packages/shared` — `nextOccurrence`, `firstOccurrence`, `addDaysToDate`, the DTO types.
3. `validators/item.ts` — `recurrence` (nullable, optional) on create + update; rejected without a
   `deadline`; unit-specific fields validated; `count` 1–999; `end.date >= start`.
4. `items_controller.ts#update` — when `checked === true` on an unchecked item that has a
   `recurrenceId` and `nextOccurrence` is non-null: in one transaction save the checked row,
   create the copy (same `recurrenceId`; name, quantity, notes, category, store, price, sort order;
   deadline = next date + same time; unchecked; sub-tasks copied unchecked when
   `list.useSubtasks`), bump `occurrences_created`, then `broadcastSync` both rows. The rule
   upsert, the "already completed?" re-read and the counter read all happen *inside* that
   transaction (SQLite serializes writers on its one connection), so two simultaneous check-offs
   spawn exactly one copy. A rule edit is only accepted on an *open* item — never a checked history
   row of the same series, which would silently retarget the open sibling. No
   `hasCapacityFor` gate — checking off frees the slot the copy takes. Payload `recurrence`:
   object → create the series (or update the shared row; only one open item per series exists, so
   edits naturally apply to future spawns); `null` → stop repeating (null this item's
   `recurrenceId` only).
   - **Unchecking a completed repeating item is an undo.** If the series' only open item is the
     copy that completing it spawned (and nothing later exists), that copy is discarded in the same
     transaction — soft-deleted like `destroy`, detached from the series so a later restore/re-add
     can't revive a second repeating item, and the series counter is decremented. The discard
     frees the slot the reopened row takes, so it bypasses the open-item limit gate. Any other open
     sibling (a later occurrence already moved on) makes the uncheck a 422, since it would leave two
     open items in one series. With no open sibling (series ended or repeat stopped) it is a plain
     reopen. Soft-deleted rows never count as siblings.
   - **Restoring a deleted row** (the restore endpoint or `store()`'s deleted-name match, both via
     `restoreItemRow`) whose series already has another open item brings it back detached, as a
     plain non-repeating item — otherwise two open items would each spawn a copy.
   - `store()` is get-or-create by name: on a match the existing row is returned unchanged and the
     payload's rule (like its deadline, price, notes …) only applies when a row is actually
     created. A malformed or deadline-less rule is still rejected up front either way.
5. `findItemByName` (`item_reuse.ts`) prefers an *unchecked* active row (then the oldest id, so the
   pick is deterministic when legacy same-name duplicates exist): with checked history rows now
   sharing a name with their open copy, name-based add paths must not "reactivate" the history row.
6. Transformer + every single-item response (and `recent`/index) preload `recurrence`, so a client
   that replaces its cached row wholesale never drops a stored rule.
7. `recurrenceRuleProblem` (shared) is the one gate for everything the date math assumes: real
   dates, whole numbers, in-range values, `nth` in {1,2,3,4,-1}. The API validator repeats the range
   checks so it stays self-contained.

## Frontend

- `RecurrenceFields.svelte`, rendered by `ItemFields.svelte` under the deadline row once a date is
  set: Repeat select (Does not repeat / Custom), "Repeat every [n] [unit]", weekday chips (week),
  day-of-month vs First/Second/Third/Fourth/Last + weekday (month), "Starts" (defaults to the
  item's date), "Ends" Never / On date / After N occurrences, and a live "Next: …" preview.
- Item edit page and create paths carry the draft, dirty-check and save payload. Saving snaps the
  deadline onto the rule's grid only when the rule itself was created or edited — an unrelated edit
  never moves a deadline that was rescheduled off-grid. An invalid rule is shown once, by the
  editor's inline alert; Save just declines to send it; `lib/api/items.ts`
  (input types + optimistic Dexie row) carries `recurrence`.
- Row chip gets a repeat icon; `formatRecurrence()` produces the summary ("Every 2 weeks on Mon,
  Thu").
- Offline: an optimistic check just checks; the server spawns the next item and the realtime
  `create` broadcast loads it (verify `hasPendingCreateForList` doesn't suppress it — it only
  covers this client's own queued creates).

## Tests (100% coverage gate)

- shared: every unit, interval > 1 anchoring, weekday sets, day-31 clamp, nth/last weekday, Feb
  29, both end types, late-completion roll-forward.
- api: spawn on check, no spawn at the end, sub-task copy, uncheck doesn't spawn, validator
  rejections, both rows broadcast, version-conflict path, shared-rule edit, stop-repeating, orphan
  series prune, name-add path ignores checked history rows.
- web: `RecurrenceFields` for each unit, edit-page save payload, offline create.

## Verification

`pnpm check`; the seeded-SQLite migration repro; run the stack live (`pnpm dev`): create a weekly
chore with a time, check it off, confirm the next item appears; repeat for monthly "Last Friday"
and "After 2 occurrences"; stop the dev server afterwards.
