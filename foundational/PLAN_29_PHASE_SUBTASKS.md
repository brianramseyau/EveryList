# Phase 29 — Sub-tasks (nested checklist items)

## Context

Items today are flat — one list, one level. There's no way to break a single item
("Plan birthday party", "Clean garage") into smaller checkable steps without making
them separate top-level items. This phase lets any item carry its own checklist of
sub-tasks, checkable independently, and — critically — stops the *parent* item from
being marked done until its sub-tasks are.

The codebase has no precedent for hierarchy anywhere (categories and folders are one
level, sibling-only). Two schema shapes were considered:

- **Self-referential `parentItemId` on `items`** — less new plumbing, but sub-tasks
  would inherit the *entire* Item surface (price, category, store, deadline) and
  require 6 separate call sites (dedup-name matching, sort-order, category learning
  ×2, recent-names, recently-deleted, open-item limit) to each remember to filter
  sub-tasks out — a standing tax on every future items-related feature, and a real
  risk of leaking sub-tasks into autocomplete/suggestions/counts if one is missed. It
  would also have required an `ALTER TABLE items ADD COLUMN parentItemId REFERENCES
  items(id)` — the exact migration shape behind a real prior production-data-wiping
  incident here (SQLite rebuilds the table for an inline-FK `ALTER TABLE`, and with FK
  enforcement on that cascade-deletes every dependent row; see `config/database.ts`
  lines 32-46 and AGENTS.md).
- **Separate `sub_items` table** (chosen) — a small table (~7 columns) scoped to
  exactly what a sub-task is: a name and a checked state. Because it's a different
  table, none of those 6 call sites ever see sub-tasks — there's nothing to filter,
  structurally. One level of nesting is a schema guarantee (the table has no
  `parent_id` of its own), not a convention someone has to uphold. Its FK is declared
  in a fresh `CREATE TABLE`, not an `ALTER TABLE` on an existing one, so it doesn't
  touch the incident's failure mode. The cost is real new plumbing (own
  controller/validator/transformer/model, own sync entity type, own offline Dexie
  table) — but the sync/offline layer already supports 6 entity types generically
  (`list`, `category`, `item`, `favorite_item`, `store`, `store_category_order`), so
  this is "add a 7th following the template," not new architecture.

Decisions confirmed with the user:

- **One level of nesting only** — sub-items cannot have their own sub-items
  (schema-enforced: the table has no self-FK).
- Sub-tasks never appear in category learning, autocomplete, recently-deleted, or the
  open-item limit — for free, by being a separate table.
- **Completion gating**: checking a parent while sub-tasks are open is always blocked.
  Auto-completing the parent when the last sub-task is checked is a **separate,
  off-by-default sub-setting**.
- Sub-tasks are gated by a per-list toggle (`useSubtasks`), with the auto-complete
  behavior as a **nested sub-toggle** (`useSubtaskAutoComplete`) — same shape as
  Categories → "Learn item categories" in `ListFeatureToggles.svelte`.
- Sub-tasks live **inline in the main list**, expand/collapse under their parent row,
  checkable right there. Adding/renaming/deleting a sub-task also happens inline (no
  need to route through the item's edit page, since sub-items are a self-contained
  table with their own lightweight endpoints).

## Data model

New migration `create_sub_items_table.ts`:
- `id`, `item_id` (FK → `items.id`, `onDelete('CASCADE')` — deleting an item deletes
  its sub-items, matching the established CASCADE pattern used for items/categories).
- `name` (string, matches `items.name`'s constraints), `checked` (bool, default
  false), `checked_at` (nullable datetime).
- `sort_order` (int — own fractional-indexing sequence scoped by `item_id` alone,
  reusing `computeMidpointSortOrder`'s existing algorithm).
- `created_by` (FK → users), `created_at`, `updated_at`, `version` (int, default 1 —
  optimistic locking, matching every other syncable table).
- No `deleted_at` — sub-items are hard-deleted (no restore/recently-deleted UI for
  something this lightweight).

New model `apps/api/app/models/sub_item.ts` (plain `BaseModel`, not `ItemSchema`),
with `@belongsTo(() => Item, { foreignKey: 'itemId' })`. `Item` gets
`@hasMany(() => SubItem, { foreignKey: 'itemId' }) declare subItems`.

New transformer `apps/api/app/transformers/sub_item_transformer.ts`, same `pick(...)`
shape as `ItemTransformer`, scoped to sub-item's own columns.

**Items index/fetch** — `.preload('subItems')` in `items_controller.ts#index` so the
whole list, including every item's sub-tasks, comes back in one fetch (matching the
existing "fetch the flat array once, render everything client-side" pattern).
`ItemTransformer` adds a `subItems: SubItemDto[]` array when preloaded.

`packages/shared/src/domain.ts` — new `SubItemDto { id, itemId, name, checked,
checkedAt, sortOrder, createdBy, createdAt, updatedAt, version }`; `ItemDto` gets
`subItems?: SubItemDto[]`.

New list-level settings, following the `useCategories`/`useCategoryLearning` pattern
exactly (`apps/api/app/models/list.ts:21-25`):
- Migration `add_subtask_settings_to_lists_table.ts`: `use_subtasks boolean not null
  default(false)`, `use_subtask_auto_complete boolean not null default(false)` — both
  off-by-default, like `useDeadline`. Sub-tasks are a todos-style feature that
  doesn't fit a shopping list, so the Shopping/Custom prefabs' starting values
  leave it off; only Todo/Chores turns it on. (2026-09-19 revision: shipped
  default-true at first, which meant every list — including Shopping — got
  sub-tasks whether or not it made sense; flipped after review.)
- `List` model: two new `@column` boolean fields with the same consume/prepare cast.
- `apps/api/app/validators/list.ts` — add both as `vine.boolean().optional()` to
  create + update validators.
- `apps/api/app/transformers/list_transformer.ts` — add both field names.
- `packages/shared/src/domain.ts` `ListDto` — add both, documented with the same
  "missing = default" convention already used for `useDeadline`.

## Backend — sub-item endpoints

New nested routes in `apps/api/start/routes.ts`, alongside the existing item routes:
```
GET    :listId/items/:itemId/subtasks
POST   :listId/items/:itemId/subtasks
PATCH  :listId/items/:itemId/subtasks/:subtaskId
PATCH  :listId/items/:itemId/subtasks/:subtaskId/move
DELETE :listId/items/:itemId/subtasks/:subtaskId
```
New `apps/api/app/controllers/sub_items_controller.ts`, structurally mirroring
`items_controller.ts`'s `store`/`update`/`move`/`destroy` (version-conflict check via
the existing `hasVersionConflict`/`reportVersionConflict` helpers, `broadcastSync`
after every mutation) but *without* the item-specific machinery that doesn't apply: no
dedup-by-name reactivation, no category resolution/learning, no open-item-limit
gating, no soft-delete/restore/purge.

New `apps/api/app/validators/sub_item.ts`: `createSubItemValidator` (`name`),
`updateSubItemValidator` (`name?`, `checked?`, `expectedVersion?`),
`moveSubItemValidator` (`previousSubItemId?`, `expectedVersion?`).

**Gate 1 — block manual parent completion.** In `items_controller.ts#update` (line
411), before flipping an item's `checked` to `true`, reject with `400 { code:
'subtasks_incomplete', message }` if the list has `useSubtasks === true` and the item
has any unchecked sub-items. New service `apps/api/app/services/subtask_completion.ts`
exporting `hasOpenSubtasks(item)` and the `SUBTASKS_INCOMPLETE` code, mirroring
`unchecked_limit.ts`'s shape.

**Gate 2 — auto-complete on last sub-task check.** In `sub_items_controller.ts#update`,
after checking a sub-item, if `list.useSubtaskAutoComplete === true` and every sibling
sub-item (by `itemId`) is now checked, also check the parent `Item` in the same
request (bump its `version`, save, emit a second `broadcastSync` for `entityType:
'item'`) — authoritative server-side, flowing through the same sync/offline-queue path
as every other mutation, not a client-only convenience that could drift (the class of
bug PR #76 fixed).

**Sync**: add `'sub_item'` to `SyncEntityType` in
`apps/api/app/models/sync_event.ts:6-7`. Sub-item mutations broadcast `entityType:
'sub_item'`; the auto-complete side-effect broadcasts a second, separate `entityType:
'item'` event for the parent.

## Offline / Dexie

`apps/web/src/lib/offline/db.ts` — add a `subItems` table (bump the Dexie schema
version). `apps/web/src/lib/api/sub-items.ts` (new, mirrors `items.ts`'s shape):
`fetchSubItems`, `createSubItem`, `updateSubItem`, `moveSubItem`, `deleteSubItem`,
each wrapped through the existing generic `offlineCreate`/`offlineMutate` helpers in
`sync-engine.ts`.

## Frontend

**List feature toggles** — `ListFeatureToggles.svelte`: add a `useSubtasks` row
(`ROW_CLASS`) and, nested under it when `values.useSubtasks` is true, a
`useSubtaskAutoComplete` row (`SUB_ROW_CLASS`) — structural copy of the
`useCategories`/`useCategoryLearning` block (lines 30-64), no destructive confirm-step
needed.
- `list-prefabs.ts` — add both fields to `ListFeatureValues`, `DEFAULT_FEATURE_VALUES`,
  and each prefab's `values`.
- `api/lists.ts` — add both to `ListFeatureFields`.
- `settings/+page.svelte` — wire both into the `values={{...}}` block, both
  default-false (`=== true`), matching the `useDeadline` convention.

**Main list view** — `apps/web/src/routes/lists/[id]/+page.svelte`:
- Items already arrive with their `subItems` array preloaded (no extra fetch).
- Item row: when `list?.useSubtasks === true && item.subItems?.length`, render a
  chevron next to the checkbox and an "N/M" progress badge on the collapsed row;
  expanding reveals an indented nested `<ul>` of sub-task rows, each with its own
  checkbox calling a new `toggleSubtaskChecked(item, subtask)` (parallel to
  `toggleChecked`, hitting `updateSubItem`) and a "+ Add sub-task" affordance at the
  bottom of the expanded list, calling `createSubItem`.
- `toggleChecked()`: when the server rejects with the new `subtasks_incomplete` code,
  surface it the same way `isUncheckedLimitError` currently routes
  `unchecked_limit_reached` to a dedicated toast — add a parallel
  `isSubtasksIncompleteError` check and message.
- Sub-task rows get their own lightweight swipe-to-delete (reuse the existing
  `swipeReveal` action) and inline rename-on-tap.

## Verification

- `pnpm --filter api test` — new specs for: `sub_items_controller` CRUD +
  version-conflict handling, `subtask_completion.ts` gating (block + auto-complete +
  auto-complete-disabled), cascade delete of sub-items when their parent item is
  deleted, `SyncEntityType`/`broadcastSync` coverage for `sub_item`.
- `pnpm --filter web test` — component/interaction tests for expand/collapse, the new
  toast path, add/rename/delete of sub-tasks, and the settings toggles.
- Manual: run the stack, create an item, add 2-3 sub-tasks, confirm the parent can't
  be checked while any are open, confirm auto-complete only fires when the sub-setting
  is on, confirm deleting a parent item removes its sub-tasks (cascade). Since this
  touches sync, do a manual two-client co-shopping check — toggle a sub-task on one
  client and confirm the other client's progress badge updates.
