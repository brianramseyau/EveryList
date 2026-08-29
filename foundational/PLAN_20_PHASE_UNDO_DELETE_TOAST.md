# Phase 20 — Undo-delete toast for list items

## Context

With the new seeded "Todos" list (PLAN_19_PHASE_LIST_FEATURE_TOGGLES.md) and its empty-history
onboarding, missclicks on delete are more costly — there's nothing to fall back on (no "recently
deleted" muscle memory yet, and the existing recently-deleted screen requires navigating away to
fix a slip). This adds a ~5-second "Item deleted — Undo" toast after every single-item delete
(swipe-to-delete or the X button) in the list view.

The app is offline-first: every write goes through a Dexie (IndexedDB) optimistic-apply +
`syncQueue` outbox (`apps/web/src/lib/offline/`), flushed to the server when online. The specific
requirement driving the design: **if the delete mutation hasn't actually reached the server yet
(still sitting in the offline queue — the normal case while offline, and a narrow window even
online), Undo must cancel/unqueue it outright so nothing is ever sent — not queue a
delete-then-restore pair.** If the delete *has* already reached the server, Undo falls back to the
existing restore machinery.

## How delete works (relevant code)

- `apps/web/src/routes/lists/[id]/+page.svelte` — `removeItem(item)`: optimistically filters
  `item` out of local `items` state, then calls `deleteItem(listId, item.id)`. Called from
  swipe-to-delete (`onCommitRight`) and the row's X button, and also reused by `clearChecked()`
  (bulk delete-checked) — **the undo toast wraps only the two direct single-item call sites, not
  the bulk path.**
- `apps/web/src/lib/api/items.ts` — `deleteItem`: writes `deletedAt`/`_dirty: true` onto the
  existing Dexie row in place (soft delete, same row — never moved to another table), then goes
  through `offlineMutate` (`apps/web/src/lib/offline/sync-engine.ts`), which enqueues a
  `syncQueue` row (`op: 'delete'`) via `enqueueConsolidated` and, if online, fires the real DELETE
  request immediately in the same call — so online, the row is typically already flushed
  (dequeued) well before a human could click Undo. Offline, it just sits in `syncQueue` until
  connectivity returns.
- `apps/web/src/lib/api/items.ts` — `restoreItem(listId, itemId)`: existing "recently deleted"
  restore action. Also offline-queueable (`op: 'restore'`), sets `deletedAt: null, _dirty: true`
  locally, reconciled on success. This is the correct fallback once a delete has actually reached
  the server.
- `apps/web/src/lib/offline/sync-queue.ts` — `dequeueMutation(id)` hard-deletes a `syncQueue` row
  by id. No existing function looked up a specific pending mutation by
  `(entityType, targetId, op)` before this phase — `enqueueConsolidated` had that exact query
  inlined but didn't expose it.
- No toast/snackbar component existed anywhere in the app before this phase.

## Design

1. **`apps/web/src/lib/offline/sync-queue.ts`** — extracted the inline pending-rows query from
   `enqueueConsolidated` into `pendingMutationsFor(entityType, targetId)`, and added:
   ```ts
   export async function findPendingMutation(
     entityType: SyncEntityType,
     targetId: number,
     op: QueuedMutation['op']
   ): Promise<QueuedMutation | undefined>
   ```
   `enqueueConsolidated` now calls the shared helper instead of its own inline query (pure
   extraction, no behavior change there).

2. **`apps/web/src/lib/api/items.ts`** — added:
   ```ts
   export async function undoDeleteItem(listId: number, itemId: number): Promise<void>
   ```
   - No Dexie (`getDb()` returns null, e.g. SSR) → falls straight through to `restoreItem`.
   - If `findPendingMutation('item', itemId, 'delete')` finds a row (delete never left the
     device — the offline case, or the brief pre-request window even online): dequeues it and
     writes `deletedAt: null, _dirty: false` directly to the Dexie row — a plain local write, not
     another queued mutation. Net effect: exactly as if the delete never happened; nothing is
     ever sent to the server.
   - Otherwise (already flushed, or a request is genuinely in flight): falls back to the existing
     `restoreItem(listId, itemId)`.
   - Accepted edge case (documented in code, not worth `AbortController` plumbing for): if Undo is
     clicked in the sub-second window where the DELETE request has been sent but its response
     hasn't returned yet, `findPendingMutation` still finds the nominally-`pending` row and
     dequeues/reverts it locally, but the server may still process the already-in-flight DELETE —
     a rare, low-severity inconsistency recoverable via the recently-deleted screen, not worth
     real in-flight cancellation for a misclick-recovery feature.

3. **New `apps/web/src/lib/components/UndoToast.svelte`** — small, generic, reusable toast/snackbar
   (message, actionLabel default "Undo", durationMs default 5000, onAction, onDismiss). Starts a
   timer on mount that fires `onDismiss` if not acted on first; cleared on action or unmount.
   Styled as a fixed bottom banner matching the list page's existing progress-strip bar, stacked
   above it. Single slot — a second delete while a toast is showing replaces it outright
   (Gmail/Todoist-style "latest wins"; the superseded delete is simply no longer undoable, same as
   before this phase).

4. **`apps/web/src/routes/lists/[id]/+page.svelte`** — added `pendingUndo` state and
   `removeItemWithUndo`, wired only to swipe-to-delete and the X button (not `clearChecked`, which
   still calls `removeItem` directly, unchanged). Undo re-inserts the captured item into local
   `items` state (sorted back by `sortOrder`) and calls `undoDeleteItem`, matching the file's
   existing optimistic-local-first style. The toast is keyed on the item id so a second delete
   during an active toast restarts the timer for the new item.

## Verification

- `pnpm check` (typecheck, lint, both apps' coverage-gated test suites).
- Unit/component tests added for: `findPendingMutation` (found/not-found cases, and that
  `enqueueConsolidated` is unaffected by the extraction); `undoDeleteItem`'s two branches
  (still-queued → dequeue + plain revert, no new queue entry; already-flushed → calls
  `restoreItem`); the list page's toast appears on delete, Undo restores the item and clears the
  queue entry, an expired timer leaves the deletion in place, and a second delete replaces an
  active toast.
- Manual: offline, delete an item, Undo within 5s, confirm via the Settings sync-status page (or
  IndexedDB inspection) that no queued mutation for that item ever existed. Repeat online and
  confirm Undo still works via the restore fallback.
