# Phase 11: List Feature Refinements

## Context

Phase 10 shipped validation/usability fixes. This phase addresses a batch of UX gaps found in day-to-day use, several inspired by AnyList (favorites richness, per-item icons) but reusing EveryList's existing patterns rather than AnyList's dated visuals. It's a large, multi-part phase touching favorites, list-item display, the item detail screen, list creation, and settings navigation — so work is broken into 6 phases, each committed separately, with a pause after each for the user to `/compact` before continuing.

Work happens on a fresh branch off `main`, e.g. `phase-11-list-refinements`.

---

## Phase A — Favorites: rich fields, icon actions, delete/re-add fix

**Problem:** `favorite_items` only stores `name`, `defaultCategoryId`, `defaultQuantity` — no store, notes, or price, unlike `items`. The UI uses text links ("Add to list" / "Remove") instead of icons, and has no "already in this list" indicator. Deleting then re-adding a favorite with the same name throws a DB unique-constraint violation because `deleteFavorite` soft-deletes (`deletedAt`) but the `(list_id, name)` unique index still counts the soft-deleted row, and `store()`/`createFavorite` never checks for a matching soft-deleted row to resurrect.

**Backend** (`apps/api`):
- New migration adding `store_id` (nullable FK → stores), `notes` (nullable text), `price` (nullable integer cents, matching `items.price`'s cents convention) to `favorite_items`.
- `FavoriteItemSchema` regenerate (`database/schema.ts`) and `FavoriteItem` model (`app/models/favorite_item.ts`) gain the new columns/relations (mirror how `Item` model exposes `storeId`/`price`).
- `app/validators/favorite_item.ts`: accept `storeId`, `notes`, `price` on create/update.
- `FavoriteItemsController.store` (`app/controllers/favorite_items_controller.ts:24-47`): before `FavoriteItem.create`, look up an existing row (including soft-deleted, via `withTrashed`-style `.whereNull` removed / `.where` without the deletedAt filter) matching `listId` + case-insensitive/trimmed `name`. If found and soft-deleted, un-delete it (`deletedAt = null`) and update its fields instead of inserting; if found and live, treat as idempotent update (mirrors `ItemsController.store`'s dedupe-by-name pattern at `items_controller.ts:103-126`). This fixes the unique-constraint bug via the "un-delete on re-add" path, consistent with why `deleted_at` (not hard delete) was chosen for offline-syncable tables (see `1786567154000_add_deleted_at_to_offline_syncable_tables.ts`).
- `FavoriteItemsController.addToList` (`favorite_items_controller.ts:120-156`): pass through `storeId`, `notes`, `price` when creating the `Item`, and add the same case-insensitive existing-item check `ItemsController.store` already does, so adding a favorite that's already on the list un-checks/no-ops instead of duplicating.

**Frontend** (`apps/web`):
- `lib/api/favorites.ts`: extend `createFavorite`/`updateFavorite` payload types with `storeId`, `notes`, `price`.
- `routes/lists/[id]/favorites/+page.svelte`:
  - Replace the "Add to list" text button with an icon button using `Icon name="plusCircle"` (same icon as the list's add-item submit button, `+page.svelte:414`), and "Remove" with `Icon name="close"` (same as the item-row delete icon, `+page.svelte:572`), each in a `h-11 w-11` touch target to match existing icon-button sizing.
  - Add a small "already on this list" badge (reuse the `checkCircle` pattern from `ItemAutocomplete.svelte:96`) next to favorites whose name matches an item currently on the list (case-insensitive/trim, same comparison `+page.svelte:194-205` and `ItemAutocomplete` already use).
  - Expand the create/edit form to include Store `Select`, Notes `Textarea`, and Price `Input` fields, following the exact field pattern used on the item detail screen (`items/[itemId]/+page.svelte:143-192`) for visual consistency.

---

## Phase B — List item row & entry field UX

**Problem:** list rows are visually short (only as tall as a 20px checkbox + text, `+page.svelte:481` `.item-row` has no explicit min-height); the item-name input doesn't expand over the left-side icon row when focused; store subtitle text is flat gray instead of store-colored.

- `+page.svelte` `.item-row` (or a new CSS rule): give rows a `min-height` (e.g. `min-h-14`/56px) and slightly more vertical padding so touch targets are easier to hit without being too precise, while keeping the 44px action buttons centered inside.
- Store subtitle (`+page.svelte:541-543`): replace the flat `text-gray-500` span with `style:color={itemStore.color}` (or a tinted/darkened variant if raw store color is too saturated for small text — verify contrast against both light/dark paper backgrounds), reusing `StoreDto.color` which already exists (`domain.ts:89-93`) and is already used for the store icon (`+page.svelte:344`) and store list swatch (`stores/+page.svelte:131-135`).
- Item entry field focus-expand: in the add-item `form` (`+page.svelte:373-416`), on focus of the `ItemAutocomplete` input, absolutely position it to grow leftward over the `clipboardText`/`eyeOutline`/`deleteSweep` icon buttons (fading/hiding them while focused), then restore the normal flex layout on blur — similar in spirit to a search-bar expand pattern. Needs a small amount of new CSS/state (`inputFocused` boolean) since no prior implementation exists to copy.
- Bulk-add textarea (`routes/lists/[id]/import/+page.svelte`): the `flex-1` class lands on flowbite's inner `<textarea>`, not the outer wrapping `<div class="relative">`, which is why it doesn't grow. Fix by wrapping the `Textarea` in a `<div class="flex-1 flex flex-col">` (or passing a class that targets the wrapper) so the *outer* div participates in the parent's flex layout and the textarea can fill available height; also drop a sensible `rows` minimum isn't needed once it's flex-sized.

---

## Phase C — Item detail screen: icons + notes width/color fix

**Problem:** `items/[itemId]/+page.svelte` labels are plain text with no icons, and the Notes `Textarea` (line 192) has no `class` override so it inherits flowbite defaults that read as narrower/differently colored than the `Input` fields above it (in practice: Textarea's default background token differs slightly from Input's in dark mode, and lack of explicit `w-full`/`bg-paper` alignment makes it look out of place next to the `Select`/`Input` rows).

- Add an `Icon` next to each field's `Label` (Name → no natural icon, keep text-only or use `pencil`/`tag`; Quantity → `counter`/`numeric` icon if one exists in `$lib/icons/mdi.ts`, else omit; Price → `currencyUsd`; Category → reuse the category's own icon or a generic `tag`; Store → the same store icon used elsewhere (`storefront` or whatever `+page.svelte:344` displays); Notes → `noteText`). Check `$lib/icons/mdi.ts` for already-registered icon names before adding new ones, to keep the bundle-loading pattern consistent.
- Fix Notes: give the `Textarea` explicit classes matching `Input`'s rendered look (`class="w-full"` at minimum; audit computed background/border against the `Input` above it and add matching override classes, e.g. `bg-gray-50 dark:bg-gray-700` if that's what's actually mismatched — confirm by rendering both side-by-side).

---

## Phase D — Stores: rename + color-based subtitle groundwork

**Problem:** `updateStore(storeId, { name, color })` already exists in `lib/api/stores.ts` and hits a working `PATCH` endpoint, but no UI calls it — there's no rename affordance on the stores page.

- `routes/lists/[id]/stores/+page.svelte`: add an edit affordance per store row (inline rename, following the same inline-edit pattern categories uses — bind `store.name`/`store.color` locally with a small Save button per row, calling `updateStore`), alongside the existing color swatch/`ColorPicker` so color can be changed too. Reuses `updateStore` — no new API needed.

---

## Phase E — List creation: opt out of categories

**Problem:** categories are always-on; grouping in `+page.svelte:87-110` and `442-455` is unconditional. No `useCategories`-style flag exists anywhere.

- Migration: add `use_categories` boolean to `lists`, default `true` (so existing lists are unaffected).
- `List` model (`app/models/list.ts`): add the boolean column with the same SQLite 0/1 `consume`/`prepare` cast used for `archived`/`badgeExcluded` (lines 15-19).
- `ListDto` (`packages/shared/src/domain.ts`) and `createList`/`updateList` client functions (`lib/api/lists.ts`) gain `useCategories`.
- `routes/lists/new/+page.svelte`: add a toggle ("Use categories" / "Keep it simple") near the Icon/Theme pickers, defaulting to on.
- `routes/lists/[id]/+page.svelte`: when `list.useCategories` is false, skip the `groups`-by-category derivation (render one flat `items` list, no section headers) — this should also fully hide category UI:
  - Item detail screen (`items/[itemId]/+page.svelte`): hide the Category `Select` block (lines 158-171) when `list.useCategories` is false (needs `list` loaded there — already fetched via `fetchList`).
  - List Settings (`routes/lists/[id]/settings/+page.svelte`): hide the "Categories" nav link when `list.useCategories` is false.

---

## Phase F — Settings/confirmation polish

Smaller, independent fixes, bundled together:

1. **Clear-checked confirmation**: `clearChecked()` (`+page.svelte:308-314`) currently fires immediately from the toolbar button (`+page.svelte:392-401`). Add the same inline confirm-state pattern already used for list deletion (`settings/+page.svelte` `confirmingDelete` state, lines 25/136/306-326) — toggle a `confirmingClear` boolean, show an inline "Clear N checked items? / Confirm / Cancel" affordance instead of a modal (no modal/dialog component exists in this codebase, so stay consistent).
2. **Categories mutate on change, no Save button**: `routes/lists/[id]/categories/+page.svelte` currently requires a per-row Save click (`saveCategory`, called from the button at lines 186-194). Change to auto-save: call `saveCategory(category)` on `onblur` of the name `Input` (only if the value actually changed, to avoid a no-op request) and immediately from `IconPicker`'s `onselect`. Remove the per-row Save button once auto-save is wired.
3. **Categories/Members back navigation → List Settings**: `PageHeader`'s `backHref` on both `routes/lists/[id]/categories/+page.svelte:138-142` and `routes/lists/[id]/members/+page.svelte:117-121` currently points to `/lists/[id]` (the list view). Change both to `resolve('/lists/[id]/settings', { id: String(listId) })` with `backLabel="Back to settings"`, so the navigation hierarchy becomes List view → List Settings → Categories/Members → (back) → List Settings, matching how they're actually reached.

---

## Execution notes

- Fresh branch off `main` before starting (e.g. `phase-11-list-refinements`).
- Save this plan under the foundational/plans folder and commit it as the first commit on the branch.
- Commit each phase (A–F) separately with its own message; pause after each commit and prompt the user to `/compact` before starting the next phase.
- Migrations: follow the existing timestamp-prefixed naming convention in `apps/api/database/migrations/` (latest is `1786567162000_...`); regenerate `database/schema.ts` after each new migration per the existing project workflow (check `AGENTS.md` / `package.json` scripts for the exact regen command).

## Verification

- Backend: run the API test suite (`apps/api`) after each backend-touching phase (A, D, E) — existing controller/model tests should catch validator or schema regressions; add/adjust tests for the favorite delete-then-recreate fix and the `addToList` dedupe check specifically, since those are behavior changes, not just new fields.
- Frontend: run the web app locally, and manually walk each changed screen:
  - Favorites: add a favorite with store/notes/price, add it to the list, delete it, re-add it (confirms the unique-constraint fix), check the "already on list" badge appears/disappears correctly.
  - List view: confirm row height/touch targets, store-colored subtitle, and the input focus-expand behavior (focus the item-name field and confirm it covers the left icons, blurs back to normal).
  - Bulk-add screen: confirm the textarea now fills available vertical space.
  - Item detail: confirm icons render next to labels and Notes now matches Input width/color.
  - Stores: rename a store, confirm it persists.
  - New list: toggle categories off, confirm the list view renders flat (no headers), item detail hides Category, and List Settings hides the Categories link.
  - Clear-checked: confirm a confirmation step appears before checked items are removed.
  - Categories: confirm renaming/re-iconing auto-saves without a Save button, and that exiting Categories/Members returns to List Settings, not the list view.
