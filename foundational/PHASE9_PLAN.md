# Phase 9: Refinements

## Context

Phase 8 (`foundational/PHASE8_PLAN.md`) established "The Index" visual identity — Slate/Paper/Ink tokens, Space Grotesk/Public Sans/IBM Plex Mono, per-list color spine, Signal-green checkmark, `font-mono tabular-nums`. That work touched color/type/the checkmark/the progress strip but left the *interaction* layer of the app largely as originally scaffolded in Phase 2–3: text-link affordances (`← My Lists`, "Remove", "Show recently deleted"), no drag-and-drop, no swipe gestures, no page transitions, and an inline absolutely-positioned popout (`ListMenu.svelte`) that doesn't match the routed-screen pattern used everywhere else (Categories/Members/Favorites/Stores are all their own routes).

This phase converts that inline/text-affordance UI into routed screens, icon affordances, drag-and-drop, and swipe gestures — a mobile-first interaction pass on top of Phase 8's visuals, not a redesign of them.

**This is a UI/UX-only phase.** Confirmed via the backend: `apps/api/app/controllers/items_controller.ts`'s generic `update()` already accepts any subset of `name/quantity/notes/categoryId/storeId/price/sortOrder/checked/expectedVersion` in one `PATCH`; `GET /lists/:listId/items/recent` + `POST /:itemId/restore` (recently-deleted) and full `Folder` CRUD + `PATCH /lists/:id { folderId }` already exist. **No migrations, no schema changes, no new backend endpoints.** The one backend-adjacent gap is a frontend TS type only: `apps/web/src/lib/api/items.ts`'s `updateItem()` input type doesn't yet include `sortOrder`/`expectedVersion`, even though the API already accepts them.

New dependencies are a real budget risk, not a hypothetical one — Phase 7's closing note documents Lighthouse Performance sitting at a real 72 against a 90 target, root-caused to JS weight from libraries not tree-shaking cleanly (flowbite-svelte's `tailwind-variants`/`tailwind-merge`). This plan deliberately avoids adding `svelte-dnd-action`, a swipe-gesture library, or Flowbite's unused `Dropdown`/`Modal` components in favor of hand-rolled, narrowly-scoped code reusing patterns already in the repo.

**Locked decisions from user review:**
- Item-detail editing is a full route (`/lists/[id]/items/[itemId]`), not a modal.
- Tapping the item **name text** opens item detail (not a pencil icon).
- Press-and-hold drag-and-drop replaces the ▲/▼ arrow buttons on **both** the list-detail item rows and the Categories screen — **arrows are removed entirely**, not kept as a fallback. This is a deliberate, accepted accessibility trade-off: WCAG 2.1 AA's automated axe-core gate does not directly catch "no keyboard equivalent for a pointer gesture" (that's a manual/2.1.1 concern, not something axe's ruleset flags), so the CI gate won't break, but reordering becomes pointer-only. Documented here so it's a recorded decision, not an oversight.
- Page transitions use the native View Transitions API via SvelteKit's `onNavigate`. Safari/iOS doesn't support it and gets instant navigation with zero transition — **accepted**, since Android is the primary target platform and iOS PWA gaps are already a known, tolerated category for this app.
- **New 14th item added during planning:** a Settings screen orientation-lock control (Auto / Portrait / Landscape), via the Screen Orientation API.

---

## 0. Technical approach

### 0.1 Popout-menu primitive → extract a shared component, not Flowbite's `Dropdown`

Extract `apps/web/src/lib/components/PopoutMenu.svelte`, built on the existing `$lib/actions/anchor-panel.ts` action (already solves fixed-position viewport clamping, already proven in `IconPicker`/`ColorPicker`) — not flowbite-svelte's `Dropdown`, which is installed but unused anywhere and would add real bundle weight for behavior (`open` toggle, click-outside, escape) `ListMenu.svelte` already hand-rolls. Reusing `anchor-panel.ts` here also fixes a latent bug: today's `ListMenu` is `absolute right-0` with no viewport clamping.

Once #10 (below) converts `ListMenu`'s contents into a routed settings screen, the only remaining consumer of `PopoutMenu` is the Lists-screen "+" icon (#1: Create List / Create Folder, each a link to its own page) — a thin component: trigger button + `anchor-panel` fixed panel + a short list of `<a>` links.

### 0.2 Drag-and-drop → hand-roll press-and-hold + Pointer Events

No DnD library. Build one reusable action, `apps/web/src/lib/actions/press-hold-reorder.ts`: `pointerdown` + ~400ms hold timer (disambiguates from scroll/tap, mirrors iOS/AnyList's long-press convention) → `pointermove` reordering via the unified Pointer Events API (`setPointerCapture`, no separate touch/mouse code paths). Parameterized by an item array and an `onreorder(fromIndex, toIndex)` callback, plus (items only) `onmove-to-category(itemId, categoryId)` for cross-group drops.

Two consumers share this action: `lists/[id]/+page.svelte` (items, within- and cross-category) and `lists/[id]/categories/+page.svelte` (categories, replacing the existing ▲/▼ glyph buttons entirely per the locked decision above).

Reordering within a category costs one `PATCH` per moved item against the existing generic `updateItem()` (once its TS type is widened — see §0 gap above); moving into a different category is one `PATCH` with both `categoryId` and a recomputed `sortOrder`.

### 0.3 Swipe-to-delete → hand-roll Pointer Events, `touch-action: pan-y`

New action `apps/web/src/lib/actions/swipe-reveal.ts` on each item row: tracks `pointerdown`→`pointermove` horizontal delta, translates the row via CSS transform, reveals a red trash-icon affordance past a threshold, fires `ondelete()` past a commit threshold, else snaps back. Set `touch-action: pan-y` (not `none`) and only take over the pointer once `|dx| > |dy|` past a small dead-zone (~10px), so vertical list scroll and the browser's native pull-to-refresh are never captured by the gesture.

Desktop-vs-touch detection via `matchMedia('(pointer: coarse)')` (reflects real input capability, handles hybrid devices, no library) — coarse-pointer devices get the swipe affordance, fine-pointer devices get a static "×" close-icon button instead. Render both code paths behind the media query rather than assuming one; this also happens to be the row's own accessible/keyboard-operable delete path.

### 0.4 View Transitions API → `onNavigate` in root `+layout.svelte`

```ts
import { onNavigate } from '$app/navigation';

onNavigate((navigation) => {
  if (!document.startViewTransition) return; // no-op on Safari/iOS — accepted
  return new Promise((resolve) => {
    document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
    });
  });
});
```

The native API has no concept of left/right directionality — it only diffs old vs. new DOM. To get a slide feel (not just a cross-fade), apply `::view-transition-old(root)`/`::view-transition-new(root)` `translateX` keyframes via a data attribute set before the transition starts, based on push-vs-pop navigation. This is real CSS work, sequenced last since it's the most novel/uncertain item. Keep the transition short (150–200ms — "snappy, not drawn out") and gate it behind `prefers-reduced-motion: no-preference`, the same pattern Phase 8 established for the checkmark settle animation (third use of that media query in the codebase).

`onNavigate` only fires for client-side SPA navigations — a hard reload or a deep link landing directly on a new route has no "from" state and correctly shows no transition. Expected behavior, not a bug; call it out in the PR description.

### 0.5 Orientation lock (new item 14) → `$lib/orientation.ts`, mirroring `theme.ts`/`accent.ts`

New Settings preference, same shape as the existing `getThemePreference`/`setThemePreference` and `getAccentPreference`/`setAccentPreference` pair (`apps/web/src/lib/theme.ts`, `apps/web/src/lib/accent.ts`):

```ts
export type OrientationPreference = 'automatic' | 'portrait' | 'landscape';
```

New `apps/web/src/lib/orientation.ts`: `getOrientationPreference()`/`setOrientationPreference()` (localStorage, `everylist:orientation` key, same `hasWindow()` SSR guard as the existing two modules) and `applyOrientation(preference)`, which calls the Screen Orientation API:

```ts
if (preference === 'automatic') {
  screen.orientation?.unlock?.();
} else {
  await screen.orientation?.lock?.(preference); // 'portrait' | 'landscape'
}
```

**Real constraint, not an edge case:** `screen.orientation.lock()` only works when the app is running in fullscreen or standalone display mode — a plain browser tab throws `NotSupportedError`/silently rejects. `apps/web/vite.config.ts`'s `VitePWA({ manifest: { display: 'standalone' } })` already confirms the installed-PWA path is covered, but **the control must detect and communicate the in-browser-tab case** rather than silently failing: check `window.matchMedia('(display-mode: standalone)').matches` (or catch the rejection) and show an inline hint ("Install EveryList to lock orientation") instead of a control that appears to do nothing. Wrap the `lock()` call in try/catch regardless — unsupported browsers (desktop Chrome, Firefox, Safari on some platforms) must no-op gracefully, matching the same "no-op is not an error" convention as `applyTheme`'s `hasWindow()` guard.

Settings UI: a third `themeOptions`-shaped radiogroup block in `apps/web/src/routes/settings/+page.svelte`'s Appearance section, next to the existing theme/accent controls, applied via `onMount` the same way `themePreference`/`accentPreference` are read today.

---

## 1. Sequencing

**Batch 1 — Shell primitives** (unblocks everything else)
- #2: `PageHeader.svelte` back-link → icon-only back arrow (`backLabel` becomes an `aria-label`, not visible text). Audit all call sites: `join/[token]`, `lists/[id]`, `lists/[id]/categories`, `lists/[id]/favorites`, `lists/[id]/members`, `lists/[id]/stores`, `lists/[id]/stores/[storeId]`, `lists`, `lists/new`, `login`, `settings`, `signup`.
- #1 + #10 together: build `PopoutMenu.svelte` (§0.1) for #1's Lists-screen "+" menu; convert `ListMenu.svelte`'s contents into a new route `lists/[id]/settings/+page.svelte` for #10, with `PageHeader`'s cog action becoming a plain icon link to that route (no popout needed once it's a full screen).
- #14: orientation-lock setting — self-contained, no dependency on anything else, can land any time in this batch or later; grouped here since it's Settings-only and low-risk.

**Batch 2 — List-detail restructuring** (depends on Batch 1's route/header patterns)
- #3: checked items stay in their category bucket (sorted after unchecked items within it) instead of a separate bottom section; add an eye-outline/eye-off-outline `$state` toggle to the right of the Add Item input. Removes the current separate "Checked" render block.
- #4: recently-deleted → new route `lists/[id]/recently-deleted/+page.svelte`, trigger moved to a history/clock icon in the header next to the existing favorites heart icon. Straight extraction of the existing `fetchRecentItems`/`restoreItem` logic into a new file following `lists/[id]/favorites/+page.svelte`'s load/error pattern.
- #5 + #12: item-entry form — drop the quantity `Input`; replace the "Add" `Button` text with a `plus-circle` icon button (`aria-label="Add item"` — **`e2e/offline-sync.e2e.ts`'s `getByRole('button', { name: 'Add' })` locator breaks and must be updated in the same commit**); implement focus-expand (name input grows to cover other row icons except Add, `$state`-driven, reduced-motion gated).
- #8: paste-import → clipboard icon left of the item-entry field, opening a new full-screen route `lists/[id]/import/+page.svelte` (not the current inline 4-row `Textarea`) — full-viewport `Textarea` + top "Save" action, calling the existing `importItems(listId, text)` unchanged.

**Batch 3 — Item-detail route** (needed before Batch 4's cross-category drag and swipe finalize against real row markup)
- #6: new route `lists/[id]/items/[itemId]/+page.svelte`. Tapping an item's name text in the list-detail row navigates here instead of showing the current inline price/store mini-editors. See §2.
- Batch 4's drag and swipe handlers land on the same `<li>` rows this route changes the tap target of — sequence #6 first so the row's final DOM/pointer-event ownership is settled before two more gesture handlers are added to it.

**Batch 4 — Reordering and gestures** (highest risk, most novel)
- #7: press-and-hold DnD for items (within- and cross-category) and the Categories-screen reorder, replacing ▲/▼ entirely, per §0.2.
- #9: swipe-to-delete + desktop "×" fallback, per §0.3.

**Batch 5 — Page transitions**
- #11: View Transitions integration per §0.4, sequenced last since it benefits from more real routes (from Batches 1–3) to transition between when testing, and is the most novel/uncertain item.

**Batch 6 — Mobile-sizing/design-consistency pass** (#13)
- Not a separate monolithic task: apply consistent tap-target sizing and Phase 8 token usage (`font-display`, `font-mono tabular-nums`) to every icon/control introduced in Batches 1–5 as each lands. Finish with one audit pass across screens Batches 1–5 don't otherwise touch (e.g. Members, Stores) to catch anything missed.

---

## 2. Item-detail route shape (#6)

**URL:** `lists/[id]/items/[itemId]`.

Structurally mirrors `lists/[id]/categories/+page.svelte` and `lists/[id]/favorites/+page.svelte`: guard on `getToken()` in `onMount` (redirect to `/login` if absent), `loadAll()` via `Promise.all`, `loading`/`error` local state, `ApiError` for error-message extraction.

There's no `fetchItem(listId, itemId)` single-item helper today (only `fetchItems(listId)`). Rather than add new backend/API surface, prefer reading the item out of the already-fetched list data (consistent with offline-first — this route must work with zero network like everything else): try the Dexie-cached item first, fall back to `fetchItems(listId)` + filter by id for a cold direct-navigation/reload. Confirm exact shape against `favorites/+page.svelte`'s existing fetch pattern before deciding.

Editable fields: name (rename — not editable anywhere today), quantity (now optional, per #5), price (already editable inline today, moves here), notes (new surface, no prior UI existed), category (new — no per-item category edit exists anywhere today), store (already editable inline today, moves here). All writes go through the existing `updateItem()` → `offlineMutate` path (already Dexie-backed, already handles optimistic writes + `expectedVersion` conflicts) — just widen its TS input type to include `sortOrder` (needed by #7) and confirm `notes`/`categoryId` are included (they already are in the validator/DTO, just need adding to the `Partial<{...}>` client type).

Category/store pickers reuse the list-detail page's existing `fetchCategories(listId)`/`fetchStores(listId)` calls. Back navigation via the now-icon-only `PageHeader`, `backHref` pointing at the parent list.

---

## 3. Critical files

Each touched component/route gets its existing `*.spec.ts`/`*.svelte.spec.ts` **rewritten**, not just extended — DOM structure changes substantially for most items (removed: `← My Lists` text, "Remove" text link, ▲/▼ glyphs, inline paste `Textarea`; moved: recently-deleted, favorites trigger, cog menu; new: icon buttons, swipe/drag affordances, new routes' own specs). This mirrors Phase 8's own closing note that comparable-scale DOM changes required spec rewrites, not additions.

| Item(s) | Primary files |
|---|---|
| #1, #10 | `apps/web/src/lib/components/PopoutMenu.svelte` (new), `apps/web/src/routes/lists/+page.svelte`, `apps/web/src/lib/components/ListMenu.svelte` (absorbed/deleted), new `apps/web/src/routes/lists/[id]/settings/+page.svelte` |
| #2 | `apps/web/src/lib/components/PageHeader.svelte` + the 12 call sites listed in Batch 1 |
| #3 | `apps/web/src/routes/lists/[id]/+page.svelte` (`groups` derived, checked-item render block) |
| #4 | new `apps/web/src/routes/lists/[id]/recently-deleted/+page.svelte`, `apps/web/src/routes/lists/[id]/+page.svelte` (header trigger only) |
| #5, #12 | `apps/web/src/routes/lists/[id]/+page.svelte` (add-item form block, ~lines 336–344 today) |
| #6 | new `apps/web/src/routes/lists/[id]/items/[itemId]/+page.svelte`, `apps/web/src/lib/api/items.ts` (`updateItem` type widen) |
| #7 | new `apps/web/src/lib/actions/press-hold-reorder.ts`, `apps/web/src/routes/lists/[id]/+page.svelte`, `apps/web/src/routes/lists/[id]/categories/+page.svelte`, `apps/web/src/lib/api/items.ts` |
| #8 | new `apps/web/src/routes/lists/[id]/import/+page.svelte`, `apps/web/src/routes/lists/[id]/+page.svelte` (remove inline block) |
| #9 | new `apps/web/src/lib/actions/swipe-reveal.ts`, `apps/web/src/routes/lists/[id]/+page.svelte` |
| #11 | `apps/web/src/routes/+layout.svelte` (`onNavigate` hook), `apps/web/src/routes/layout.css` (view-transition CSS, reduced-motion gate) |
| #13 | rolled into every file above; final audit pass has no single file target |
| #14 | new `apps/web/src/lib/orientation.ts`, `apps/web/src/routes/settings/+page.svelte` |

---

## 4. Risks

- **Swipe-to-delete vs. native scroll/pull-to-refresh.** Mitigated via `touch-action: pan-y` + horizontal-dominant delta gating (§0.3), but `touch-action`/`overscroll-behavior` interaction nuances are a known source of subtle bugs on iOS's rubber-band scroll specifically. Verify on real Android Chrome (primary target) and don't assume desktop touch-emulation testing is sufficient — add as an explicit manual test step, since jsdom can't exercise real pointer-capture semantics.
- **Bundle/performance budget.** Even without new DnD/swipe libraries, 5+ new routes and several new action modules still add weight. Re-run `node scripts/lighthouse-check.mjs` incrementally (after Batch 2, after Batch 4), not just once at the end, against the documented 65 floor.
- **Coverage-gate friction on gesture code.** Pointer-driven drag/swipe logic is hard to get to 100% branch coverage via jsdom alone (no real pointer capture/geometry/timing). Structure `press-hold-reorder.ts`/`swipe-reveal.ts` as small, synchronously-testable state machines driven by synthetic `PointerEvent`s with controlled `clientX`/`clientY`, planned up front rather than retrofitted.
- **Orientation lock's in-browser-tab no-op.** `screen.orientation.lock()` silently fails outside standalone/fullscreen mode — the Settings control must detect this (`display-mode: standalone` media query) and show an explanatory hint rather than a control that appears broken.
- **Zero backend/migration risk.** This phase touches no `apps/api` files and no migrations — the SQLite cascade-delete footgun class of risk (AGENTS.md) doesn't apply here. Stated for the record since that's normally the first risk check for this codebase.

---

## 5. Verification

- `pnpm --filter web test:unit` (Vitest, 100% coverage gate) — every file in §3's table gets its spec rewritten; new files need net-new specs from the start.
- `pnpm --filter web test:e2e` — `e2e/offline-sync.e2e.ts`'s Add-button locator needs updating for #12 immediately; `e2e/accessibility.e2e.ts` needs review once swipe/DnD/new routes exist.
- `pnpm lint` + `pnpm typecheck` clean, including after `updateItem()`'s type widen.
- Manual pass on real Android Chrome (primary target) for swipe gesture feel and scroll-conflict checking; confirm `prefers-reduced-motion` disables both the page transition and any drag-drop animation.
- axe-core gate: confirm the swipe-to-delete's desktop "×" fallback is present, labeled, and keyboard-operable (the one gesture that does get a documented fallback, per §0.3) — drag-and-drop's removed-arrows trade-off is accepted, not tested for.
- `node scripts/lighthouse-check.mjs` against a production build after Batch 2 and again after Batch 4, against the documented 65 floor.
