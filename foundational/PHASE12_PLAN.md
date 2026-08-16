# Phase 12: Lists Page Reorder + Account Identity

## Context

Three related gaps found in day-to-day use:

1. The main Lists page (`routes/lists/+page.svelte`) has no drag-and-drop reorder, unlike categories (`routes/lists/[id]/categories/+page.svelte`) and folders — lists are stuck in `createdAt` order.
2. `fullName` can only ever be set once, at signup (`NewAccountController`/`signupValidator`) — there's no way to change it afterward.
3. Settings (`routes/settings/+page.svelte`) shows a bare "Signed in" / "Log out" row with no indication of *which* account is signed in.

(2) and (3) are the same UI surface — an Account section in Settings that shows the current user's identity and lets them edit their name — so they're done together in Phase B. Per user decision: email is shown read-only (no edit) in this pass; reorder is **per-user** (each list member can arrange their own view of shared lists independently), not a single shared order.

Work happens on branch `phase-12-lists-reorder-account`, off `main`. Two phases, each committed separately, with a pause after each for the user to `/compact` before continuing.

---

## Phase A — Lists page drag-and-drop reorder (per-user)

**Problem:** Lists are shared between members (`list_members`), so a single `sort_order` on `lists` itself would force one order on every member. Ordering needs to live on the per-user join row, mirroring how `folders.sort_order` already gives each user their own folder order.

**Backend** (`apps/api`):
- New migration: add nullable-then-backfilled `sort_order` integer column to `list_members`, defaulting new rows to an incrementing value per user (mirror `folders`' `nextSortOrder` helper in `folders_controller.ts`). Backfill existing rows in the same migration using each user's current `accepted_at`/`created_at` order, so existing lists keep their present relative order instead of collapsing to 0. This is an `alterTable` on a table that itself has cascade children — re-read the SQLite footgun note in `AGENTS.md` before writing it, and verify `config/database.ts`'s `foreign_keys` guard is still scoped to skip the `console` environment before running it locally.
- `ListMemberSchema` regenerate (`database/schema.ts`) and `ListMember` model gain `sortOrder`.
- `ListsController.index`: order by the requesting user's `list_members.sort_order` (join/where already scopes to `userId`) instead of `lists.createdAt`.
- New `ListsController.reorder` action + `reorderListsValidator` (mirrors `CategoriesController.reorder` / `reorderCategoriesValidator` in `app/validators/category.ts`): body is `{ order: number[] }` of list ids; only updates `sort_order` on the requesting user's own `list_members` rows for those ids (no version/broadcastSync needed — this is purely a per-user view preference, not shared list state, so it doesn't need to sync to other members like category reorder does).
- Route: `router.patch('/reorder', [controllers.Lists, 'reorder'])` under the existing `lists` group in `start/routes.ts`, positioned before `/:id` routes the same way categories' reorder is positioned before `/:categoryId`.

**Frontend** (`apps/web`):
- `lib/api/lists.ts`: add `reorderLists(order: number[]): Promise<ListDto[]>` following `reorderCategories`'s shape exactly.
- `routes/lists/+page.svelte`: apply `pressHoldReorder` to the unfiled-lists list and to each folder's list group, same structure as `categories/+page.svelte` (`getRowEls`/`handleDrop`/`reordering` state, `data-reorder-ignore` on the folder `<Select>`). Reordering only makes sense within a flat list of ids sent to the server — dragging across folder groups changes `folderId` via the existing `moveListToFolder`, not via the reorder endpoint, so drag is scoped per-section (each folder's group and the unfiled group are independent drag containers, matching how folders themselves are visually separated already).
- Add the same "press and hold to drag" hint text used on the categories page.

**Tests:** migration backfill test, `ListsController.reorder` functional test (own rows only, other users' lists untouched), `pressHoldReorder` wiring on the lists page (reuse the existing spec patterns from `categories/page.svelte.spec.ts`).

---

## Phase B — Account identity in Settings + editable name

**Problem:** No way to see or change who's logged in beyond a "Log out" button; `fullName` is signup-only.

**Backend** (`apps/api`):
- `app/validators/user.ts`: add `updateProfileValidator = vine.create({ fullName: vine.string().trim().minLength(1).maxLength(150).nullable() })`.
- `ProfileController`: add `update({ auth, request, serialize })` — validates, merges `fullName` onto `auth.getUserOrFail()`, saves, returns `serialize(UserTransformer.transform(user))`. No version/broadcastSync — `users` isn't a synced/offline table.
- Route: `router.patch('profile', [controllers.Profile, 'update'])` alongside the existing `account.profile` group in `start/routes.ts`.

**Frontend** (`apps/web`):
- `lib/api/auth.ts`: add `updateProfile(input: { fullName: string | null }): Promise<UserDto>` (`apiPatch('/api/v1/account/profile', input)`), following `fetchProfile`'s shape.
- `routes/settings/+page.svelte`: replace the bare "Signed in" row with an Account section showing:
  - Email (read-only text).
  - Name — inline-editable `Input`, using the same focus/blur-save-if-changed pattern as category names in `categories/+page.svelte` (`editStartNames`/`handleNameFocus`/`handleNameBlur`), calling `updateProfile`.
  - The existing Log out button, unchanged.
  - Load the profile via `fetchProfile()` in `onMount` alongside the existing `fetchMeta()` call.

**Tests:** `ProfileController.update` functional test (own user only, validation, persisted `fullName`), settings page spec covering the render-current-name and save-on-blur paths (mirror `categories/page.svelte.spec.ts`'s equivalent cases).

---

## Out of scope (explicitly deferred per user decision)

- Email editing/verification.
- Cross-member (shared) list ordering — this phase is per-user only.
