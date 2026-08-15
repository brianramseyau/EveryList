# Phase 8 — Visual Identity ("The Index")

## Context

Phase 7 (`foundational/PHASE7_PLAN.md`) was the last phase planned in `foundational/PLAN.md` §14, but it left the app's visual design untouched: default Tailwind/Flowbite styling, no custom typography, and a generic cyan "Ocean" accent (`#0ea5e9`) as the only brand color. Functionally complete, visually unstyled scaffolding.

The product is a self-hosted, offline-first, general-purpose list app — any kind of list (packing, to-do, wishlist, chores, groceries), not grocery-specific, despite grocery-shaped optional features (per-item price, store/aisle selection) existing in the code. It's explicitly modeled on **AnyList**: solid UX ("I rarely trip over it") but tired visuals and aggressive paywalling. EveryList is free and self-hosted, so the identity leans into that directly — no upsell/premium-badge/urgency UI patterns, anywhere, ever.

The one genuinely distinctive thing already built into the data model is per-list personalization — every list already carries a user-chosen color and icon (`ColorPicker.svelte`, `IconPicker.svelte`, `list.color`/`list.icon`, already read via inline `style:color` bindings in the list-detail view). AnyList's analogous idea is its decorative list "theme" skins (corkboard, chalkboard, notebook paper) — a reasonable concept with dated execution. This phase does the same job — each list has its own visual identity — in a clean, modern, non-skeuomorphic way, keeping the app's own chrome quiet so each list's color is what pops.

## Design tokens

**Color** (Tailwind v4 `@theme` block in `apps/web/src/routes/layout.css`):
- Paper (bg): `#F6F5F1` · Ink (text): `#201F1D` — dark mode: bg `#1B1D1F`, text `#EDEAE3`
- Slate — new default `--color-primary-*` scale (replaces Ocean as default), a calm ink-indigo for UI chrome only (buttons, links, nav active state): 50 `#F1F3F6` / 100 `#DFE3EA` / 200 `#C1C9D6` / 300 `#9AA7BC` / 400 `#6C7C97` / 500 `#3E4C63` / 600 `#33404F` / 700 `#293240` / 800 `#212831` / 900 `#191E25` / 950 `#101318`
- Signal `#2E8B57` — new, narrow-use: reserved for the checkmark/"item completed" state only, never a general brand color
- Ocean (today's default cyan scale) becomes a selectable accent alongside the existing Forest/Berry/Sunset — unchanged values, just no longer default
- Per-list color swatches (`ColorPicker.svelte`) are untouched — that's the personality layer

**Type** — three self-hosted, subsetted variable woff2 fonts (never Google Fonts network requests — this is an offline-first PWA, and PHASE7_PLAN.md §5 already fought hard for its Lighthouse score):
- Space Grotesk — display face: wordmark, page titles, list-card names
- Public Sans — body/UI face, becomes the new `--font-sans` default
- IBM Plex Mono — utility face for item counts, quantities, prices; must retain the `tnum` (tabular figures) OpenType feature through subsetting

**Signature — "The Index":** the lists-overview screen (`lists/+page.svelte`) becomes a set of cards with a bold left-edge color spine in each list's own `list.color`, plus its icon and name — a real, grounded personalization feature made the centerpiece rather than invented decoration. Inside a list, that color washes lightly through the category-header divider. Checking off an item uses a custom-drawn checkmark glyph in Signal green with a brief settle micro-interaction (reduced-motion-aware), replacing the default Flowbite checkbox. The old dollar total is replaced by a sticky "X of Y done" progress strip — works for every list type, not just ones with prices.

## 1. Fonts

Add subsetted variable woff2s to `apps/web/static/fonts/` (not `src/lib/assets/` — `static/` is what `VitePWA`'s `workbox.globPatterns` already precaches for offline use, and font URLs referenced only from CSS don't benefit from Vite's content-hashing). Subset with `pyftsubset`, `--flavor=woff2`, Latin+Latin-1+punctuation ranges, `--layout-features='*'` to preserve `tnum`.

New `apps/web/src/lib/fonts.css` (or a block at the top of `layout.css`) with `@font-face` declarations, `font-display: swap` on all three. Add `--font-display`, `--font-sans` (override), `--font-mono` (override) to the existing `@theme` block.

Budget each subset under ~30–40KB; re-run `node scripts/lighthouse-check.mjs` against a production build afterward (`THRESHOLDS.performance: 65`, the documented real number — not the aspirational 90 in `PLAN.md`).

## 2. Color tokens — `layout.css` / `app.html` / `vite.config.ts`

- Replace the default `@theme` `--color-primary-*` scale with the Slate ramp; add `--color-paper`, `--color-ink`, `--color-signal`.
- Move the current cyan scale verbatim into a new `[data-accent='ocean']` block; leave Forest/Berry/Sunset blocks untouched.
- **Decision needed:** since Slate now lives in the base tokens rather than behind a `data-accent` value, there's no swatch to pick to get back to it once a user selects another accent. Add a 5th accent value `'slate'` (no CSS block needed — base tokens already are Slate) to `accent.ts`'s `AccentPreference`/`VALID_PREFERENCES`, `app.html`'s inline bootstrap script, and `settings/+page.svelte`'s `accentOptions` array (as the new default/first entry), rather than leaving Slate unreachable from Settings.
- Add `--color-paper`/`--color-ink` dark-mode overrides into the existing `:root.dark` rule; update `html`/`html.dark` background-color to match Paper/dark-Paper exactly (existing comment already requires these stay in sync).
- Update `app.html`'s `<meta name="theme-color">` from `#0284c7` to Slate-600 `#33404F`.
- Also update `apps/web/vite.config.ts`'s `VitePWA({ manifest: { background_color, theme_color } })` — a third place the old Ocean hex + white background live (PWA install splash/task-switcher chrome), easy to miss and leaves a stale-colored splash screen if skipped.
- `apps/web/src/routes/+layout.svelte`: the root wrapper's `bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100` collapses to `bg-paper text-ink` — no `dark:` variants needed once the tokens flip inside `:root.dark`.

## 3. Component edits

- **`lists/+page.svelte`** (Index screen): `listCard` snippet gets a `border-l-4` with `style:border-left-color={list.color}` (extends the file's existing inline-style pattern), list name in `font-display`, item count in `font-mono tabular-nums`. Drop `hover:border-primary-500` for a neutral hover — chrome shouldn't compete with the per-list color.
- **`lists/[id]/+page.svelte`**: category `<h2>` keeps its existing `style:color={list.color}` and gains a matching `style:border-bottom-color` divider. Replace the Flowbite `Checkbox` with a custom checkmark `<button role="checkbox">` + inline SVG, styled with `--color-signal`, settle animation gated behind `@media (prefers-reduced-motion: no-preference)` (first use of that media query anywhere in the codebase — sets the pattern). Must preserve keyboard operability and label association that Flowbite's checkbox gave for free. Replace the `Total: $x.xx` text with a sticky progress strip ("X of Y done", `font-mono tabular-nums`) fixed above `BottomNav`, positioned via a CSS custom property for the nav's height rather than a hardcoded offset. Empty state swaps generic text for the list's own `Icon`/`list.color`.
- **`PageHeader.svelte`**: `font-display` on the `<h1>`, thin `border-b` under the title row. Shared across multiple routes — verify all call sites after the change.
- **`BottomNav.svelte`**: no source change required — its active-state classes already read `--color-primary-*`, so they pick up Slate automatically once §2 lands.
- **`+page.svelte`** (landing): wordmark in `font-display`; hero shows a small fan/stack of miniature Index-style cards (varied per-list colors/icons) rather than a bare heading. Extract the spine-card visual into a shared component (e.g. `IndexCard.svelte`) used by both this hero and the real list cards, so the look has one source of truth. Any entrance animation follows the same reduced-motion gating as the checkmark interaction.

## Sequencing

Fonts → color tokens (+ `+layout.svelte` simplification) → `PageHeader`/`BottomNav` (low-risk, unblocks visual review everywhere) → `lists/+page.svelte` Index cards (build the shared card component here) → `lists/[id]/+page.svelte` (divider → checkmark → progress strip → empty state, increasing complexity) → landing hero (reuses the shared card component).

## Risks

- Contrast: Slate text-on-Paper is high-contrast and low-risk; verify `--color-signal` clears AA at whatever size it's used at. Per-list colors are user-chosen and unbounded — the Index motif makes `list.color` more visually prominent (bigger spine bars), which may surface pre-existing bad contrast picks (e.g. white icon glyph on a light user-chosen color) more visibly than today, though that's a pre-existing condition, not newly introduced.
- Two spec files almost certainly assert on current copy/DOM and will need updates, not be treated as regressions: `lists/[id]/page.svelte.spec.ts` and `lists/page.svelte.spec.ts` (empty-state text, `Total: $x.xx`, Flowbite checkbox DOM), plus `e2e/offline-sync.e2e.ts`.
- No `prefers-reduced-motion` handling exists anywhere in the codebase today; this pass introduces the first two instances (checkmark settle, hero entrance) and should gate both correctly rather than assume `transition: none` alone is sufficient.

## Verification

- Visual check across light/dark × 5 accents (Slate default, Ocean, Forest, Berry, Sunset) on `/`, `/lists`, `/lists/[id]` (with at least one light-colored and one dark/saturated user-chosen list color).
- Confirm no flash-of-wrong-theme on reload (the `app.html` blocking script must still run before first paint after edits).
- Re-run `node scripts/lighthouse-check.mjs` against a production build after fonts land.
- Run `test:unit`, `test`, `test:e2e` — expect and fix the failures in the files named above rather than treating them as a reason to back out.

## Critical files

- `apps/web/src/routes/layout.css`, `apps/web/src/app.html`, `apps/web/vite.config.ts`
- `apps/web/src/routes/lists/+page.svelte`, `apps/web/src/routes/lists/[id]/+page.svelte`
- `apps/web/src/lib/accent.ts`, `apps/web/src/routes/settings/+page.svelte`
- `apps/web/src/lib/components/PageHeader.svelte`, `BottomNav.svelte`
- `apps/web/src/routes/+layout.svelte`, `apps/web/src/routes/+page.svelte`
