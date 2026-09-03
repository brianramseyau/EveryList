# Phase 25 — Per-list open-item limit (unchecked-item cap)

## 2026-09-03 revision — uncheck is gated too

Manual testing surfaced a hole in the original design: unchecking a previously-checked
item was explicitly exempted from the limit (see "Never gated" below, as shipped), so a
list could be silently overloaded past its cap by unchecking items one at a time — no
error, no feedback, just a list quietly sitting over its limit. That's now a hard block,
matching every other intake path:

- **Every path that flips `checked` from `true` to `false`** — the checkbox
  (`items_controller.ts#update`), re-adding a checked item's name (the reactivate
  branches in `items_controller.ts#store`, `favorite_items_controller.ts#addToList`,
  and the Alexa `AddItemIntent` handler), and the on-screen Alexa tap gesture
  (`uncheckItemRow`) — now calls `hasCapacityFor` first and refuses with the same `400
  { message, code: 'unchecked_limit_reached' }` shape (Alexa: a spoken refusal) when the
  list has no room. A list can still legitimately end up over its cap (the limit was
  lowered below the current count), just never via an uncheck anymore.
- **New copy** (`limitReachedMessageForUncheck` in `unchecked_limit.ts`): *"This list
  allows at most N open items — check one off or remove one before unchecking this
  one."*
- **Frontend**: the list page's checkbox tap (`toggleChecked`) pre-checks
  `isAtLimit(list, items)` before unchecking and, when blocked, shows a **red** toast
  (`UndoToast`'s new `variant="error"`) instead of performing the optimistic update or
  calling the server — no undo needed, since nothing happened. The add-item path's
  catch block routes a server-side `unchecked_limit_reached` rejection (the reactivate-
  checked branch, hit when a checked item's name is re-typed on a full list) to the
  same red toast rather than the generic inline error banner used for other add
  failures.
- Superseded below: every "unchecking is never gated" statement in the original design
  (Semantics' second bullet under "Never gated", the concurrency/coverage notes that
  assumed it) — left in place as history of the original decision, not the current
  behavior.

## Context

EveryList lists grow without bound: a "todo" list ends up holding tens-to-hundreds of
items, most of them noise. This phase adds a per-list, optional **cap on unchecked
("open") items** — a WIP limit that turns any list into a true short-horror to-do
list: you can only have N items you actually need to do on it at a time. Checking an
item off frees a slot immediately.

Decisions confirmed with the user:

- **Hard block** — when the limit is reached, adds are refused (input disabled with a
  "limit reached" note). No backlog/parking section; no warn-only mode.
- **All intake paths gated** — typed/autocomplete add, bulk import, restore from
  Recently Deleted, move-in from another list, favorites add-to-list, and Alexa adds.
  Otherwise the limit is trivially bypassed.
- **Counter in the existing bottom bar** — the fixed bottom bar already shows
  progress ("N of M remaining") on the left and the price total on the right
  (`apps/web/src/routes/lists/[id]/+page.svelte`); the new `open/max` counter joins
  the right side alongside the total.

## Semantics

- Count = active items with `checked = false` (`deletedAt IS NULL`).
- `maxUncheckedItems` is a **nullable integer on `lists`** (`null` = unlimited, the
  default; valid range 1–999).
- **Gated intake** — any action that makes an invisible-or-new row appear as an
  unchecked item on the list:
  - create (`items_controller#store`, both the fresh-create and restore-deleted
    branches)
  - bulk import (`items_controller#import`) — the whole import is rejected atomically
    if it wouldn't fit
  - explicit restore (`items_controller#restore`)
  - move-in from another list (`items_controller#moveToList`) — only when the moved
    item is unchecked
  - favorites add-to-list (`favorite_items_controller#addToList` create branch)
  - Alexa add-item (`alexa/intent_router.ts` create + restore-deleted branches) —
    responds with a spoken refusal, not an HTTP error (Alexa routes are 200-envelope)
- **Never gated** (treated as unchecking, not intake):
  - unchecking a checked item
  - re-adding the name of an item already on the list but checked (the existing
    "reactivate" branches in `store`/`addToList`/Alexa)
  - This means a list may legitimately sit **over** its limit (the limit was lowered
    below the current count, or an item was unchecked while full). The limit gates
    *intake*; it is not a maintained invariant. New adds stay blocked until the count
    drops back to the limit. Lowering/removing the limit is always allowed.
- Error convention: HTTP entry points return `400 { message, code:
  'unchecked_limit_reached' }` (matching the existing `response.badRequest({ message
  })` domain-error shape, plus a machine-readable `code` so clients never string-match
  on message text).

## Backend changes

1. **Migration** (`1789400000000_add_max_unchecked_items_to_lists_table.ts`) — adds
   `max_unchecked_items` (`table.integer('max_unchecked_items').nullable()`) to
   `lists`. Pure add-column, **no inline FK** — not the ALTER+CASCADE footgun shape
   (AGENTS.md incident, 2026-08-15); no backfill, so no `this.defer` needed. Still
   reproduced against a seeded SQLite file before merge per AGENTS.md.

2. **`apps/api/database/schema.ts`** — auto-generated by `node ace migration:run`
   once the migration above runs. Never hand-edited.

3. **`apps/api/app/models/list.ts`** — nullable-integer column with a consume cast
   following the `Item.price` nullable-int pattern (`null` stays `null`, numbers
   coerced).

4. **`apps/api/app/validators/list.ts`** — `maxUncheckedItems:
   vine.number().range([1, 999]).nullable().optional()` in both `createListValidator`
   and `updateListValidator`. `lists_controller#update`'s `list.merge(rest)` picks it
   up unchanged.

5. **`apps/api/app/services/list_creation.ts`** — `CreateOwnedListInput` gains
   `maxUncheckedItems?`, passed into `List.create(...)` with `?? null` default.

6. **New `apps/api/app/services/unchecked_limit.ts`** — the single enforcement
   helper:
   - `hasCapacityFor(list, incomingCount = 1): Promise<boolean>` — counts unchecked
     active items on the list, compares against `list.maxUncheckedItems` (`null` →
     always true).
   - `limitReachedMessage(list): string` — e.g. *"This list allows at most 5 open
     items — check one off to add more."*
   - Concurrency note: the check-then-insert race (two simultaneous adds both passing
     the count) is accepted, the same tolerance the existing duplicate-name check in
     `store()` already has. SQLite's single-writer execution keeps the window tiny.

7. **Controller wiring** — each gated path calls `hasCapacityFor` before mutating and
   returns `response.badRequest({ message, code: 'unchecked_limit_reached' })` (or an
   Alexa spoken refusal) when it fails:
   - `items_controller.ts#store` — gates the fresh-create **and** restore-deleted
     branches; *not* the reactivate-checked branch.
   - `items_controller.ts#import` — gates the whole import if
     `parsedItemCount > capacity`; message includes remaining slots.
   - `items_controller.ts#restore` — gates before `restoreItemRow`.
   - `items_controller.ts#moveToList` — gates only when the moved item is unchecked.
   - `favorite_items_controller.ts#addToList` — gates the create branch (not
     reactivate-checked).
   - `alexa/services/intent_router.ts` (add item) — gates create + restore-deleted;
     refusal text: *"«list» is limited to N open items and is full — check something
     off first."*

8. **`apps/api/app/transformers/list_transformer.ts`** — picks
   `maxUncheckedItems: list.maxUncheckedItems ?? null`.

9. **`.adonisjs/` regeneration** — validator changes touch the generated types:
   run `pnpm dev` in `apps/api`, confirm **both** the `generating indexes...`
   and `tuyau: created api client registry` log lines, stop it, `git add
   apps/api/.adonisjs/`, then confirm `pnpm typecheck` is clean (AGENTS.md registry
   footgun).

## Shared DTO

10. **`packages/shared/src/domain.ts`** — `ListDto` gains `maxUncheckedItems?:
    number | null`, documented as *missing/null = no limit* (same optional-field
    convention as the `use_*` booleans). Old cached clients see `undefined` → no
    limit → today's behavior.

## Frontend changes

11. **New `apps/web/src/lib/unchecked-limit.ts`** — pure helpers shared by every
    entry point: `uncheckedCount(items)`, `isAtLimit(list, items)`
    (`list?.maxUncheckedItems != null && uncheckedCount >= limit`),
    `remainingSlots(list, items)`. The gate reads the Dexie-backed in-memory state
    (list row + items are cached and painted instantly), so it works fully offline;
    the server gate backstops stale local counts.

12. **`apps/web/src/routes/lists/[id]/+page.svelte`**:
    - Bottom bar right side: `{open}/{max}` counter (mono/tabular like the total),
      amber styling when at/over limit; coexists with the price total in a flex row.
    - At limit: add input + autocomplete disabled (`addItem` guarded too),
      placeholder → "Limit reached — check something off".
    - Subscribes to the new flush rejection listener (below) and shows a transient
      toast — *"«name» wasn't added — «server message»"* — for rejections of this
      list's items, then refreshes via the existing flush-outcome path.

13. **Other UI entry points** — favorites add-to-list, import, recently-deleted restore, and
    item-edit move-to-list already surface `ApiError.message` in their existing error
    handling, and the server's 400 message is user-facing copy — so the limit rejection
    displays there with no extra plumbing. No local pre-check was added on these pages:
    none of them hold the list's items in memory, and a pre-check would require a new
    fetch purely to duplicate the server's authoritative check. The main add path (the
    list page) does pre-check, since its items are already in memory.

14. **`apps/web/src/routes/lists/[id]/settings/+page.svelte`** — new "Open item
    limit" subsection: number input (1–999), empty = no limit, saved via the existing
    `updateList` flow, helper text with the current open count. Immediate-apply like
    the feature toggles.

## Offline-first: completing the sync-queue DLQ

An offline add onto a stale-count full list is rejected by the server when the
queued create replays. Today `flushQueue`'s terminal-4xx branch (`flush.ts`
`status: 'failed'` marking) **leaves the optimistic temp row in the `items` table**
— a phantom item that `fetchItems()`'s `_dirty` merge keeps alive forever, visible
only as a failed row on Settings → Sync. The `syncQueue` table is already a DLQ in
substance (full payload + `lastError` + attempts persisted; `pendingMutations()`
filters `'pending'`, so failed entries never auto-retry) — this phase completes it
rather than adding a parallel store:

15. **`apps/web/src/lib/offline/flush.ts`** — in the terminal-4xx branch, for
    `create`/`attach` mutations, delete the optimistic temp row
    (`tableForEntity(...).delete(mutation.targetId)`). The mutation row (with its
    full payload) stays in the DLQ — nothing is silently lost, for *any* rejection
    reason. Restores are excluded (their Dexie row is the real soft-deleted item;
    it stays deleted, mutation still DLQ'd). Then fire a new
    `onCreateRejected(listener)` notification (`{ entityType, message }`), same
    listener-set pattern as `onConflict`/`onFlushOutcome`.

16. **`apps/web/src/lib/offline/sync-queue.ts`** — `retryMutation(id)` helper
    (`status → 'pending'`, attempts reset, `lastError` cleared); discard is the
    existing `dequeueMutation`.

17. **`apps/web/src/routes/settings/sync/+page.svelte`** — per-entry **Retry** and
    **Discard** buttons on failed mutations (today even the global "Retry now" can't
    touch failed rows, since `flushQueue` replays `pendingMutations()` only). Retry
    is meaningful for limit rejections: check something off, retry the parked add —
    the server's dedup/reactivate branch handles any name collision in the meantime.

## External API compatibility

- OpenAPI spec is generated from the live validators/transformers — no hand-maintained
  doc to sync; the build's `openapi_build` hook picks the new field up.
- Alexa: handled above (spoken refusal).
- Home Assistant integration: item-level writes only, and `move_item` maps to the
  in-list `move` endpoint (no cross-list move), so no new rejection surface; its list
  parsing ignores unknown list fields.

## Verification

- Migration reproduced against a seeded SQLite file (pre-migration schema +
  representative parent/child rows → run migration → child rows intact).
- Backend tests (100% coverage enforced): `items.spec.ts` (limit blocks create /
  restore-on-name-match / explicit restore / import / move-in of an unchecked item;
  checked-item move-in allowed; lowering below the current count allowed with adds
  blocked; **2026-09-03**: unchecking at the limit blocked, allowed once room opens,
  reactivate-by-name blocked when full), `lists.spec.ts` (set/clear/bounds via create +
  update), `favorites.spec.ts` (add blocked; **2026-09-03**: reactivate-checked blocked
  when full), `alexa.spec.ts` (spoken refusal; **2026-09-03**: re-speaking a checked
  item and the on-screen tap-to-uncheck gesture both refused when full).
- Frontend tests (100% coverage enforced): `lib/unchecked-limit.spec.ts`;
  settings page (control save/clear); list page (counter, gating, toast;
  **2026-09-03**: red toast on a blocked uncheck, both the local pre-check and the
  server backstop, and on a blocked reactivate-by-name add); `UndoToast.svelte.spec.ts`
  (**2026-09-03**: `variant="error"` styling); `flush.spec.ts` (sever + listener +
  restore exclusion); `sync/page.svelte.spec.ts` (retry/discard); blocked-state tests
  for the favorites/import/recently-deleted/item-edit specs.
- `pnpm check --skip-e2e`, then the E2E suite.
