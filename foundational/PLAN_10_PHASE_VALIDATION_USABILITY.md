# Phase 10: Validation / Usability

## Context

Phase 9 (`foundational/PLAN_09_PHASE_REFINEMENTS.md`) converted the list-detail screen into routed screens, icon affordances, and hand-rolled press-hold drag-and-drop (`press-hold-reorder.ts`) plus swipe-to-delete (`swipe-reveal.ts`), all layered onto the `<li>` rows of `apps/web/src/routes/lists/[id]/+page.svelte`. It deliberately left the row's tap target as a real `<a>` wrapping the item name — which now collides with Chrome's native long-press-on-link context menu on mobile, since the row is also a press-hold drag surface. It also left list names and item names completely unconstrained (no uniqueness, no dedup), and the main list page's store handling split across three different, redundant controls (an "All stores" filter dropdown, a per-item inline store select, and a separate store-management menu).

This phase is validation/usability cleanup: it adds real data-integrity constraints (unique list names, deduped items with sensible checked/unchecked semantics), adds autocomplete to speed up entry, and fixes several rough edges in the list-detail screen's interaction model that Phase 9 surfaced. Unlike Phase 9, this phase touches both backend (`apps/api`) and frontend (`apps/web`).

**Decisions locked via user review before this plan was written:**
- List-name uniqueness is per-owner, case-insensitive + trimmed, excludes soft-deleted lists. No existing duplicates in the current (dev) database, so the migration adds the unique index directly — no dedup-before-migrate step needed.
- Item de-duplication is case-insensitive + trimmed, scoped to the list. A match against an **unchecked** item blocks creation and briefly highlights the existing row instead. A match against a **checked** item is treated as "not really there" — re-adding it **unchecks** the existing item rather than creating a duplicate or just highlighting.
- Autocomplete merges **favorites + recent item-name history** for that list (deduped against each other), not favorites alone.
- After removing the "All stores" filter dropdown, the main list **auto-filters** to whichever store is currently marked "shopping at" (the existing local `getSelectedStore()` selection already used to drive aisle-order overrides) — same effective behavior as today's dropdown, just driven by existing state instead of a separate control.
- The sticky header change is scoped to the list-detail screen only (`lists/[id]/+page.svelte`), not applied globally to `PageHeader.svelte`.
- Swipe-to-delete becomes directional: swipe right deletes (unchanged red/trash), swipe left opens item-detail edit (new blue/pencil reveal) — replacing today's "either direction deletes" behavior. The far-right pencil-icon link from §0.8 becomes desktop-only (gated behind `!isCoarsePointer`, matching the existing grip-icon/delete-× convention), since touch devices now reach edit via the swipe-left gesture instead.
- "Delete all crossed-off items" is a client-side bulk action (loop over already-checked items, reusing the existing single-item soft-delete path) rather than a new backend bulk-delete endpoint — keeps the offline-mutation-queue behavior automatically consistent with no new sync logic.

No new dependencies anywhere in this phase — everything reuses patterns already in the repo (VineJS custom validation, Lucid raw SQL for an expression index, the existing `span style:color` icon-tint pattern used for `list.color`, `matchMedia('(pointer: coarse)')`, the `data-reorder-ignore` opt-out convention, `anchor-panel.ts` for positioned panels).

---

## 0. Technical approach

### 0.1 List-name uniqueness — migration + friendly-error plumbing

New migration `apps/api/database/migrations/<next-timestamp>_add_unique_index_to_lists_name.ts`, using `this.schema.raw(...)` since Lucid's schema builder has no expression-index helper and SQLite supports partial + expression indexes natively:

```ts
async up() {
  this.schema.raw(
    `CREATE UNIQUE INDEX lists_owner_id_name_unique
     ON lists (owner_id, LOWER(TRIM(name)))
     WHERE deleted_at IS NULL`
  )
}
async down() {
  this.schema.raw('DROP INDEX IF EXISTS lists_owner_id_name_unique')
}
```

This adds an index, not a column via `alterTable` with an inline FK — it does **not** trigger the SQLite `alterTable`+CASCADE table-rebuild footgun documented in `AGENTS.md`. Still confirm no duplicate list names exist in the live DB immediately before merging, since migrations run automatically on container boot with no staging step.

Friendly-error handling is needed in two layers, on both `ListsController.store()` (create) and `update()` (rename):
1. **Controller-level pre-check**: query for an existing list owned by the same user with the same normalized name (excluding the current list's id on update, excluding soft-deleted rows), and if found, return a 422 in the same validation-error shape the frontend's existing `ApiError` message-extraction already understands (used today across `favorites`/`stores`/`categories` pages) — no new frontend error-handling code needed.
2. **Exception-handler mapping** in `apps/api/app/exceptions/handler.ts` for the raw SQLite unique-constraint-violation case (covers races that slip past the pre-check). This closes a real existing gap: `favorite_items` already has a DB-level `unique(['list_id','name'])` constraint with no pre-check and no handler mapping, so a duplicate favorite currently causes an unhandled 500. Fix that in the same commit — it's the same handler-level change, essentially free once the mapping exists.

Both `createListValidator`/`updateListValidator` stay as-is; this is deliberately controller-level rather than Vine's `unique()` rule, since that rule can't express `LOWER(TRIM())` + soft-delete exclusion + "exclude own row on update" cleanly.

### 0.2 Item de-duplication — backend authoritative, frontend pre-check for instant feedback

**Backend**, in `ItemsController.store()`, before `Item.create(...)`: look up an existing non-deleted item in the same list with a case-insensitive/trimmed name match.
- No match → create as today.
- Match, and it's **checked** → uncheck it (`checked = false`, `checkedAt = null`, bump `version`), save, broadcast, return that item's DTO instead of creating a new row.
- Match, and it's **unchecked** → return that item's DTO unchanged (no create).

This is a plain query, not a new constraint/index — item names are legitimately allowed to repeat across lists, and "checked vs unchecked" can't be expressed by a simple unique index anyway. Given this app's single-process/single-connection better-sqlite3 deployment, the read-then-write here is not subject to a cross-request race the way a multi-connection Postgres setup would be — note that assumption explicitly in the PR description. The bulk paste-`import()` action is intentionally **not** touched — pasted lists are expected to allow whatever the user pasted.

**Frontend online path** (`+page.svelte`'s `handleAddItem()`):
- Local pre-check against the already-loaded `items` array (best-effort, case-insensitive/trimmed) — if an unchecked match exists, skip the API call, don't clear the input, and briefly highlight the existing row (a `$state`-tracked highlighted-item-id with a fade-out CSS transition).
- Regardless of the pre-check, handle the case where `createItem()`'s response has an `id` that's already present in `items` (server matched instead of creating): replace that row in place rather than appending, triggering the same highlight. This single change correctly covers the no-match/unchecked-match/checked-match cases.

**Offline/Dexie path**: the immediate-online case is already correct via the in-place-replace logic above. The genuinely-offline-then-later-flushed case has a real, narrower gap — `flush.ts`'s replay currently discards the create response entirely and never reconciles Dexie afterward (a pre-existing issue, made newly visible by this feature). Scope for this phase: extend the create-replay branch to at least delete the queued temp row on success (parity with the already-online path), and document in the PR that full reconciliation remains an open gap, mitigated by the next full `fetchItems()` refresh.

### 0.3 Autocomplete — new recent-names endpoint, merged with favorites

New read-only `ItemsController` action, `recentNames()`, registered as a new route (e.g. `GET /lists/:listId/items/recent-names`, alongside the existing `items/recent` and `items/categorize` routes — pick a path that doesn't collide with the existing soft-deleted-items `recent` route):

- Query all items (including checked + deleted) for the list, ordered by `createdAt desc`.
- Dedupe in application code by normalized (trimmed/lowercased) name, keep first-seen (= most recent) casing, cap at ~50 names.
- Return `string[]`.

Frontend: new `fetchRecentItemNames(listId)` in `apps/web/src/lib/api/items.ts`, with an offline fallback deriving the same list from Dexie's cached items if the network call fails (mirroring the existing local-fallback pattern already used for category suggestions in that file).

New component `apps/web/src/lib/components/ItemAutocomplete.svelte` wrapping the add-item text input: merges favorites (`fetchFavorites`) + recent names into a deduped suggestion list (favorites first), filtered by substring match against the current input, capped at ~20 entries. Each suggestion shows the name, a small icon if it's a favorite, and a small icon if it's already in the list (computed against the current `items` array) — selecting a suggestion fills the input without auto-submitting. Reuses `anchor-panel.ts` (Phase 9's positioning primitive, already used by `IconPicker`/`ColorPicker`/`PopoutMenu`) for the panel's positioning rather than hand-rolling it again.

### 0.4 Remove per-item store select → subheading only

Remove the inline per-row store `<Select>` (and its `tagItemStore()` handler, once confirmed unused elsewhere) from `+page.svelte`'s item rows. Replace with a small read-only subheading line under the item name/quantity, shown only when `item.storeId` is set, using a simple lookup against the already-loaded `stores` array. Store editing continues to live on the item-detail route (`lists/[id]/items/[itemId]/+page.svelte`, built in Phase 9) — no backend change, this is purely making the main-row store display informational instead of an inline editor, consistent with how price/quantity are already detail-only.

### 0.5 Remove "All stores" filter dropdown → auto-filter via `getSelectedStore()`

Delete the `filterStoreId` state and its `<Select>` filter control. Load the current "shopping at" selection (`getSelectedStore(listId)` from `apps/web/src/lib/api/selected-store.ts`, the same local/Dexie-backed state that already drives aisle-order overrides) during `loadAll()`, and drive `visibleItems` from that instead: `null` selection shows everything, otherwise filter to `item.storeId === selectedStoreId`. Since the stores page is the only writer of this selection, make sure `+page.svelte` re-reads it on navigating back from `/stores` (check whether `onMount` already re-runs on return, or whether an explicit re-check is needed — follow whatever pattern the existing aisle-order-override read already uses, if it has the same requirement).

### 0.6 Header store icon recolors to the selected store

Wrap the header's static `Icon name="store"` link (nav to `/lists/[id]/stores`) in a `<span style:color={selectedStore?.color}>`, mirroring the existing `list.color` icon-tint pattern already used elsewhere on this page. `selectedStore` is a small derived lookup (`stores.find(s => s.id === selectedStoreId)`) from §0.5's loaded selection. When nothing is selected, `style:color={undefined}` falls through to the icon's existing default color classes — no extra branching needed.

### 0.7 Sticky list header

Scoped to `lists/[id]/+page.svelte` only (per locked decision) — wrap that screen's `<PageHeader>` usage in a local `sticky top-0 z-20 bg-paper` wrapper with `pt-[env(safe-area-inset-top)]` (mirroring `BottomNav`'s existing `pb-[env(safe-area-inset-bottom)]` safe-area handling), rather than modifying `PageHeader.svelte` itself. `z-20` matches `BottomNav`'s existing z-index precedent so popout panels (`anchor-panel.ts` consumers) still render above it correctly. An opaque background is required so scrolled content doesn't show through underneath.

### 0.8 Anchor → non-link row + desktop-only pencil-icon edit trigger

Replace the `<a href=".../items/[itemId]">` currently wrapping the item name/quantity with a plain non-interactive element — this removes the actual cause of the mobile long-press-shows-link-dialog bug (a real `<a>` sitting inside a press-hold drag surface). Add a new pencil-icon link at the **far right** of the row, using the same href the removed anchor used, gated behind `{#if !isCoarsePointer}` (matching the existing grip-icon/delete-× convention) — this becomes the desktop navigation path to item-detail, since §0.9 below gives touch devices a swipe gesture for the same destination instead. This icon **must** get `data-reorder-ignore` (the existing opt-out convention already applied to the checkbox/store-select-wrapper/delete-button in `press-hold-reorder.ts`), otherwise it reintroduces a race between tap-to-edit and hold-to-drag on the same element. As defense-in-depth, add `touch-action: manipulation` plus `-webkit-touch-callout: none` on the row's content wrapper.

This row-markup change should be done together with §0.4's subheading change and §0.9's grip-icon/swipe-direction changes, since all touch the same `<li>` structure — avoid touching this row multiple separate times.

### 0.9 Grip icon hidden on mobile; swipe becomes directional (right = delete, left = edit)

**Grip icon**: the static decorative `dragVertical` grip icon (currently always visible) gets the same `{#if !isCoarsePointer}` gating already used for the desktop-only delete "×" button one element below it — reusing the existing `isCoarsePointer` value computed once at mount. Coarse-pointer (mobile) devices lose the icon entirely, since press-hold-anywhere already covers reorder there; desktop keeps it as a discoverability hint. Confirm `press-hold-reorder.ts` is bound to the whole `<li>`, not the icon itself, so hiding the icon doesn't accidentally disable drag anywhere.

**Swipe direction change**: today `swipe-reveal.ts` fires the same `ondelete()` regardless of swipe direction (`+page.svelte` renders two mirrored red/trash reveal panels, one per edge, both wired to `removeItem`). Change this to two distinct outcomes based on the sign of the committed `dx`:
- Swipe **right** (content translates right, left-edge panel revealed) → **delete**, unchanged red background + `trashCanOutline` icon, calls `removeItem(item)`.
- Swipe **left** (content translates left, right-edge panel revealed) → **edit**, new blue background + a pencil icon (matching whatever icon name §0.8's desktop pencil link uses, for visual consistency), navigates to the same item-detail route §0.8's link uses.

This requires widening `SwipeRevealParams` in `apps/web/src/lib/actions/swipe-reveal.ts` from a single `ondelete` callback to two direction-specific callbacks (e.g. `onCommitRight`/`onCommitLeft`), and having `handlePointerEnd` pick which one to invoke based on `Math.sign(dx)` once the existing `REVEAL_PX * COMMIT_RATIO` threshold is met — the threshold/commit logic itself is unchanged, only what fires on commit. Update the file's own header comment (currently describes this as swipe-to-delete only) and its spec, which is 100%-coverage-gated and currently only exercises the single-callback shape.

In `+page.svelte`, swap the two mirrored trash panels for one trash panel (left-edge, revealed by right-swipe) and one distinct blue/pencil panel (right-edge, revealed by left-swipe), and pass both callbacks into `use:swipeReveal`. Navigating away mid-list (to item-detail) while a swipe is committing should reuse the same `resolve(...)` href pattern already used elsewhere on this page, via `goto()` from `$app/navigation` (swipeReveal's commit is a callback, not a real anchor, so `goto()` is the correct navigation primitive here, not an `<a>`).

### 0.10 "Add store" → "Add"

One-line label change in `apps/web/src/routes/lists/[id]/stores/+page.svelte`, matching the `Add` convention already used on the Favorites and Categories pages' identically-shaped submit buttons. Check for (and update) any e2e locator keyed on the old "Add store" text.

### 0.11 "Clear checked" bulk action

Add a small icon button next to the existing show/hide-checked eye toggle (`+page.svelte`, the add-item form's toolbar row — see the existing `showChecked`/`eyeOutline` control), visible only when `checkedItems.length > 0`. On click, it removes every currently-checked, currently-visible item.

Deliberately **no new backend endpoint** — loop over `checkedItems` and call the existing single-item `removeItem()` (soft-delete via `DELETE /lists/:listId/items/:itemId`, already wired through `offlineMutate`) for each, via `Promise.all` (each call targets a different item id, so there's no version-conflict risk between them the way there would be for concurrent edits to the *same* item). This automatically inherits correct offline-queue behavior with zero new sync logic, and removed items land in "Recently deleted" exactly like a single manual delete — consistent with this app's existing convention of no confirmation dialogs on destructive actions (checked here: no `confirm()`/modal pattern exists anywhere else in this codebase for delete actions; recoverability via Recently Deleted is the app's existing safety net, not a confirmation prompt).

### 0.12 Header text made non-selectable

Usability fix, not tied to any specific screen: tapping a `PageHeader` title (or back-label) on mobile can trigger the browser's native text-selection/copy menu instead of registering as a tap on the back button, which is directly adjacent. Apply `user-select: none` (and `-webkit-user-select: none` for Safari) to `PageHeader.svelte`'s title and back-button label — a pure CSS change with no DOM/structural change, so unlike §0.7's sticky-header change, this is safe to apply globally to the shared component rather than scoping per-screen: it doesn't add new elements, change layout, or require rewriting each screen's spec (existing specs assert on structure/behavior, not `user-select` styling).

---

## 1. Sequencing

**Batch 1 — Backend foundations** (no frontend dependency, unblocks Batch 2/3)
- List-name uniqueness: migration, `ListsController` pre-checks, exception-handler mapping (also closing the parallel `favorite_items` gap).
- Item dedup-with-uncheck: `ItemsController.store()` change.
- New `items/recent-names` endpoint + route.
- Backend spec coverage for all three, extending existing `items_controller`/`lists_controller`/`favorite_items_controller` spec files per this repo's 100%-coverage gate.

**Batch 2 — Frontend dedup UX** (depends on Batch 1's item-dedup endpoint behavior)
- `+page.svelte`'s `handleAddItem()`: local pre-check + highlight state, id-collision replace-in-place logic.
- `flush.ts`: create-replay temp-row cleanup parity fix.

**Batch 3 — Autocomplete** (depends on Batch 1's `recent-names` endpoint + existing favorites endpoint)
- `fetchRecentItemNames()` in `apps/web/src/lib/api/items.ts`.
- New `ItemAutocomplete.svelte` + merge-helper + its own spec.
- Wire into `+page.svelte`'s add-item form.

**Batch 4 — List-detail row/header restructuring** (independent of Batches 1–3; touches the same file as Batch 2/3's wiring, so land after them to avoid rebase churn)
- §0.4 store subheading, §0.5 filter removal + auto-filter, §0.6 icon recolor, §0.7 sticky header, §0.8 anchor→desktop-pencil, §0.9 grip gating + directional swipe (delete/edit) — all in `+page.svelte` (§0.9 also touches `swipe-reveal.ts`), sequenced together since several touch the same row markup.
- Rewrite `+page.svelte`'s spec to match (DOM changes substantially in one pass: anchor removed, two selects removed, pencil link + subheading + sticky wrapper + directional swipe panels added) — rewrite rather than patch, per the convention Phase 9 already established for comparable-scale DOM changes. `swipe-reveal.ts`'s own spec needs extending for the new two-callback shape.

**Batch 5 — Small cleanup and additions**
- §0.10 button label + any e2e locator update.
- §0.11 "Clear checked" bulk action — depends on Batch 4's row markup being settled first (same file), but is otherwise independent logic; own commit.
- §0.12 header text non-selectable — fully independent of everything else in this phase (touches only `PageHeader.svelte`'s CSS), can land any time; grouped here as it's low-risk cleanup.

Each batch should land as its own commit (per the workflow requirement for this phase), and within a batch, prefer one commit per logical file group (e.g. Batch 1's migration+controller+handler as one commit, its spec updates can ride along or be a second commit).

---

## 2. Critical files

| Item(s) | Primary files |
|---|---|
| List-name uniqueness (0.1) | new `apps/api/database/migrations/<ts>_add_unique_index_to_lists_name.ts`, `apps/api/app/controllers/lists_controller.ts`, `apps/api/app/exceptions/handler.ts`, `apps/api/app/controllers/favorite_items_controller.ts` |
| Item dedup + uncheck (0.2) | `apps/api/app/controllers/items_controller.ts` (`store()`), `apps/web/src/routes/lists/[id]/+page.svelte` (`handleAddItem`), `apps/web/src/lib/offline/flush.ts` |
| Autocomplete (0.3) | `apps/api/app/controllers/items_controller.ts` (new `recentNames()`), `apps/api/start/routes.ts`, `apps/web/src/lib/api/items.ts`, new `apps/web/src/lib/components/ItemAutocomplete.svelte`, `apps/web/src/routes/lists/[id]/+page.svelte` |
| Store subheading, filter removal, icon recolor, sticky header, anchor→desktop-pencil, grip gating (0.4–0.8) | `apps/web/src/routes/lists/[id]/+page.svelte` |
| Directional swipe: right=delete, left=edit (0.9) | `apps/web/src/lib/actions/swipe-reveal.ts`, `apps/web/src/routes/lists/[id]/+page.svelte` |
| "Add store" → "Add" (0.10) | `apps/web/src/routes/lists/[id]/stores/+page.svelte` |
| "Clear checked" bulk action (0.11) | `apps/web/src/routes/lists/[id]/+page.svelte` |
| Header text non-selectable (0.12) | `apps/web/src/lib/components/PageHeader.svelte` |

---

## 3. Risks

- **Coverage-gate blast radius.** Every touched file with real logic changes needs its spec rewritten/extended to keep 100% coverage (`items_controller.ts`, `lists_controller.ts`, `handler.ts`, `favorite_items_controller.ts`, `flush.ts`, `items.ts` API client, and `+page.svelte`). The `+page.svelte` spec needs a full rewrite, not incremental edits, given the scale of DOM changes in Batch 4.
- **Migration timing.** Even with no duplicates today, this is a point-in-time fact — re-verify against the live DB immediately before merging, not just once during planning, since migrations run automatically on container boot with no staging step.
- **Sticky header stacking.** The new top-pinned header needs a deliberate `z-index` (matching `BottomNav`'s `z-20`) so popout panels still render above it, plus `env(safe-area-inset-top)` padding (mirroring `BottomNav`'s existing bottom safe-area handling) — nothing has been pinned to the top of this screen before, so this is new territory, not a copy of an existing pattern.
- **Anchor removal vs. two existing pointer-gesture state machines.** `pressHoldReorder` and `swipeReveal` already coexist on nested elements of the same row via timing/threshold heuristics, not explicit mutual exclusion. The new pencil-icon link is exactly the kind of addition that can reintroduce a three-way race if `data-reorder-ignore` is missed — treat this as the highest-care single line in Batch 4, and test explicitly: press-hold on the pencil icon must not trigger reorder, and a tap on it must navigate rather than being swallowed by swipe's dead-zone logic.
- **Offline dedup reconciliation is only partially closed.** The immediate-online path is fully correct; the queued-then-flushed-later offline path only gets temp-row cleanup, not full response reconciliation. A user who adds an already-checked item's name while offline may see a transient duplicate locally until the next full refresh — acceptable and should be called out in the PR description, not treated as a blocking gap.
- **`favorite_items` unique-constraint fix is opportunistic.** If the SQLite constraint-violation error shape needs more investigation than expected, ship the list-name path first and defer the favorites fix rather than blocking Batch 1 on it.
- **Directional swipe raises the stakes of `swipeReveal`'s existing race with `pressHoldReorder`.** Today a "wrong" gesture recognition just means a delete fires when reorder was intended (annoying but recoverable via Recently Deleted); once swipe-left means *edit* (navigation) instead of delete, a misrecognized gesture now means an unwanted navigation away from the list, which is a more disruptive failure mode. Test both directions explicitly against the existing hold-timer/dead-zone heuristics, not just the previously-existing right-swipe/delete path.
- **"Clear checked" via `Promise.all` over many individual DELETE requests** is simple and reuses existing offline-safe machinery, but on a very large checked-count this is many parallel requests/SSE broadcasts at once rather than one bulk operation — acceptable for this app's realistic list sizes (self-hosted, personal/household shopping lists), not a concern worth a new backend endpoint for this phase.

---

## 4. Verification

- `pnpm --filter api test` (`c8 node ace test`, coverage-gated) + `pnpm --filter api lint` + `pnpm --filter api typecheck`.
- `pnpm --filter web test` (`vitest run --coverage`, coverage-gated) + `pnpm --filter web lint` (`prettier --check . && eslint .`) + `pnpm --filter web typecheck` (`svelte-kit sync && svelte-check`).
- `pnpm --filter web test:e2e` (Playwright) — run after Batch 4 and Batch 5 given the anchor→pencil-icon row-markup change and the "Add store"→"Add" label rename, either of which can break existing locators.
- Root `pnpm test` / `pnpm lint` / `pnpm typecheck` as a final pre-merge pass across both workspaces.
- Manual checks not covered by automated suites: force the SQLite unique-constraint violation for both list-name and favorite-item races locally to confirm the exception-handler mapping returns a friendly 422, not a 500; verify on a real Android Chrome device (not devtools touch emulation, which doesn't always reproduce Chrome's native long-press-on-link dialog faithfully) that press-and-hold on an item row no longer triggers it, and that swipe-right/swipe-left reliably resolve to delete/edit respectively without misfiring into a reorder-drag.

---

## Workflow note

Work happens on a new branch off `main` (`phase-10-validation-usability`); each batch/item gets its own commit as noted in §1.
