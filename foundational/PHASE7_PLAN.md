# Phase 7 — Polish

## Context

`foundational/PLAN.md` §14 lists Phase 7 ("Polish") as the last planned phase: passcode lock, extra premium-equivalent themes, personalized autocomplete, and a performance/accessibility hardening pass. Phase 6 (item-store tagging, prices, folders, badge counts, export) shipped in commit `6e3ef8f` but — unlike Phases 3–5 — never got a closing status note appended to `PLAN.md`; that is backfilled first so the doc's trail stays accurate before Phase 7 is added on top.

Three scope calls were locked in with the user before implementation:
- **Passcode = simple PIN**, not WebAuthn — matches the app's "boring technology" stack.
- **Personalization = frequency-based**, not a trained ML model — a real backend service, per §3's requirement, but built from data already in the DB (item→category history), not a new ML pipeline.
- Both are explicitly consistent with existing codebase idioms — no new infrastructure classes are introduced.

## 1. Backfill the Phase 6 status note (`foundational/PLAN.md`)

Append a closing status note after the existing Phase 5 note, in the same style as the Phase 3/4/5 notes: what shipped (Store item-tagging + filtering, prices/budget total, Folders, badge count + exclusion via Web Badging API, SMTP2GO email export), confirmed present in the current tree (`apps/api/app/models/folder.ts`, `List.badgeExcluded`, `apps/web/src/lib/pwa/badge.ts`, `apps/api/app/mails/list_export_mail.ts`). No code changes, doc only.

## 2. Passcode lock

**Threat model (stated explicitly since it shapes every decision below):** this is a local, shared-device deterrent — "don't let someone who picked up my open tablet casually see my surprise-gift list" — the same tier of protection AnyList's own passcode offers, not a cryptographic secret. Any list member already has full API access to the list's contents via their session; the PIN only gates the *client-side render* of that list's content on that device. This must work fully offline (core §1 principle), which drives the hashing scheme below.

**Schema** — new migration `add_passcode_hash_to_lists_table` (nullable `passcode_hash` text column, no FK — safe per the `AGENTS.md` cascade-delete footgun, since this isn't a foreign key). `List` model needs no new `@column` decorator (plain string, no boolean cast).

**Hashing scheme (client-computed, server-opaque):** the client generates a random salt and computes `SHA-256(salt + pin)` via the Web Crypto `SubtleCrypto` API (no new dependency), stores it as a single string `"<saltHex>:<hashHex>"`. The server never sees the raw PIN — it just stores/returns this opaque string like any other `List` field. This means:
- Setting/clearing works through the **existing** `PATCH /lists/:id` update path (owner-only via `ListPolicy.requireList(..., 'owner')`, already enforced in `lists_controller.ts`) — add `passcodeHash: vine.string().trim().maxLength(200).nullable().optional()` to `updateListValidator` (`apps/api/app/validators/list.ts`), add `'passcodeHash'` to `ListTransformer`'s pick list, add `passcodeHash: string | null` to `ListDto` (`packages/shared/src/domain.ts`).
- Unlocking is a **pure client-side hash comparison** against `list.passcodeHash`, which works offline because `GET /api/v1/lists/:id` already rides the service worker's stale-while-revalidate cache (§9) — no new Dexie table needed.

**Frontend — new `apps/web/src/lib/passcode.ts`:** `generateSalt()`, `hashPasscode(pin, salt)`, `buildPasscodeHash(pin)` (salt+hash combined), `verifyPasscode(pin, storedHash)`. Session-scoped unlock state via `sessionStorage` (`everylist:unlocked:<listId>`) so re-entry isn't required on every navigation within a tab session but does reset on a fresh app open — mirrors AnyList's own "ask once per app open" behavior.

**New `PasscodeGate.svelte`:** PIN-entry UI shown in place of the list body when `list.passcodeHash` is set and the session-unlock flag isn't present.

**List detail page (`apps/web/src/routes/lists/[id]/+page.svelte`):** only the *body* (add-item form, category groups, checked/recent items) is replaced by `PasscodeGate` when locked — the `PageHeader`/`ListMenu` stay visible and reachable. This is deliberate: it gives owners a built-in recovery path (they can always open `ListMenu` → "Remove passcode" even if they forget the PIN, since that mutation is already owner-role-gated server-side, not PIN-gated) with zero extra recovery-flow code.

**`ListMenu.svelte`:** add a "Set/Change/Remove Passcode" inline form (same pattern as the existing email-export toggle) — computes the hash client-side via `$lib/passcode.ts` and calls `onupdate({ passcodeHash })` / `onupdate({ passcodeHash: null })`. Extend its `onupdate` Partial<> type and `apps/web/src/lib/api/lists.ts#updateList`'s input type with `passcodeHash?: string | null`.

**List index (`apps/web/src/routes/lists/+page.svelte`):** small lock icon badge on cards where `list.passcodeHash` is set — cheap visual affordance, no gating logic needed there (gating only matters once inside the list).

## 3. Personalized (frequency-based) categorization

Current state: `packages/shared/src/auto-categorize.ts`'s static `suggestCategoryName` keyword table is called both server-side (`resolveCategoryId` in `apps/api/app/controllers/items_controller.ts`, used at item create) and client-side (`guessCategoryId` in `apps/web/src/lib/api/items.ts`, used only for the offline-optimistic row before the server round-trip). At the time this phase shipped, no new tracking table was needed — personalization was derived from `Item` rows that already exist.

> **Superseded by Phase 17** (see `foundational/PHASE17_PLAN.md`): the item-derived frequency heuristic was replaced with a dedicated `category_learnings` table — a persisted, exponentially-decayed, server-authoritative learned model that only learns from *explicit* category assignments and is synced read-only to the offline client. The "no new tracking table is needed" stance above is no longer accurate.

**Backend — new `apps/api/app/services/category_suggestion_service.ts`:** `suggestCategoryId(list, itemName): Promise<number | null>`. Looks up past `Item` rows in **this list** (personalization is list-scoped, matching how `Category` overrides are already list-scoped, not user-scoped — a shared list's convention should apply to everyone on it) with a case-insensitive exact name match and a non-null `categoryId`, grouped by `categoryId`, ordered by count desc. Falls back to today's static-table lookup (`suggestCategoryName` + `getEffectiveCategories`) when there's no personal history. `resolveCategoryId` in `items_controller.ts` calls this new service instead of the static-only logic directly — item creation itself gets smarter, not just the new endpoint.

**New endpoint:** `GET /lists/:listId/items/categorize?name=<itemName>` (viewer role, same pattern as other list-scoped GETs) → `{ categoryId: number | null }`. Route added in `apps/api/start/routes.ts` next to the other `:listId/items/*` routes. New `CategorizeSuggestionDto` in `packages/shared/src/domain.ts`.

**Frontend (`apps/web/src/lib/api/items.ts`):** `guessCategoryId` tries `apiGet('/api/v1/lists/:id/items/categorize?name=...')` first; on success uses its `categoryId`. On failure (offline and this exact `listId`+name was never fetched before, so nothing in the SW's `StaleWhileRevalidate` cache for `/api/v1/*`) it falls back to the existing local static-table lookup, unchanged — this is the "plan for what an offline client does when it can't reach the service" the PLAN.md §3 note calls for, and it reuses the SW caching that already exists rather than adding a new Dexie cache table.

## 4. Extra themes (accent palettes)

Current theming (`apps/web/src/lib/theme.ts`, `apps/web/src/routes/layout.css`) is a light/dark toggle only; Flowbite/Tailwind v4 components consume a single `--color-primary-*` CSS variable block defined once in `@theme`. Tailwind v4 utilities reference these as `var(--color-primary-*)` at runtime (not baked in at build time), so redefining the variables under a different selector re-themes every component with zero component-level changes — this is the "cheap once the light/dark foundation exists" mechanism §16 anticipated.

**`layout.css`:** keep the current cyan/sky values as the default (`ocean`) palette, scoped under `:root, [data-accent='ocean']`, and add three more selector blocks — `forest` (green), `berry` (violet/pink), `sunset` (amber/orange) — each redefining the same `--color-primary-50..950` custom properties. `data-accent` lives on `<html>`, alongside the existing `.dark` class toggle.

**New accent module** (extend `theme.ts` or a sibling `accent.ts` following its exact structure — `hasWindow()` guard, `localStorage` key `everylist:accent`, `getAccentPreference`/`setAccentPreference`/`applyAccent`, default `'ocean'`). `app.html`'s inline bootstrap script gets the same treatment as the dark-mode bootstrap — reads and applies `data-accent` before first paint so there's no flash of the wrong accent, matching the existing "no FOUC" rule for dark mode.

**Settings page (`apps/web/src/routes/settings/+page.svelte`):** new accent swatch row inside the existing "Appearance" section, next to the theme radiogroup — 4 named swatches, same interaction pattern as the theme buttons (`role="radiogroup"`).

## 5. Performance & accessibility hardening pass

Current state: **no Lighthouse or axe-core setup exists anywhere in the repo.** Also found in passing: `apps/web`'s `test:e2e` script (Playwright, including the Phase 5 offline-sync spec) is **not** currently run by any CI workflow — `ci.yml`/`test.yml` only run `pnpm -r test` (unit/component tests), never `pnpm --filter @everylist/web test:e2e`. §13 requires both Lighthouse ≥90 and WCAG 2.1 AA "checked in CI" — fixing that CI gap is in scope here since it's a prerequisite for the a11y check actually running anywhere.

- Add `@axe-core/playwright` to `apps/web`, add a new `apps/web/e2e/accessibility.e2e.ts` that runs `axe-core` against the login page (unauthenticated) and a real list-detail page (reusing the same sign-up-and-seed pattern `e2e/offline-sync.e2e.ts` already establishes), asserting zero violations.
- Add a Lighthouse harness: a small script (`apps/web/scripts/lighthouse-check.mjs`) using the `lighthouse` npm package driven over Playwright's already-installed Chromium via CDP (reusing the CI-provisioned browser, no extra install step) — signs up/seeds a list the same way, then audits the list-detail route, asserting Performance/Accessibility/Best Practices/PWA scores ≥90 per §13. Wired as a new `apps/web` package script `test:lighthouse`.
- Wire both into `.github/workflows/ci.yml` as new jobs (`needs: test`, reusing `apps/web/playwright.config.ts`'s existing dev-server webServer setup).
- **Run the harness and fix whatever it actually finds.** The specific fixes can't be fully enumerated until the tools run — this step is explicitly "run, triage, fix, iterate until green," not a fixed checklist. Likely candidate areas based on a quick skim: color-contrast on muted gray text (`text-gray-500`/`400` on white/dark backgrounds — Flowbite's defaults are borderline AA), missing `aria-label`s on icon-only buttons, and any obvious perf easy-wins the report surfaces (image sizing, unused JS). Document what was actually found/fixed in the closing PLAN.md status note, same as prior phases.

## 6. Testing

Both workspaces stay at the existing 100%-coverage gate throughout (c8 for `apps/api`, Vitest v8 for `apps/web`) — new code follows the same dependency-injection/no-dead-branch discipline already established (§11).
- `apps/api`: functional tests for `passcodeHash` round-trip through list update (owner/non-owner matrix), unit tests for `category_suggestion_service.ts` (personalized hit, keyword fallback, no match at all), functional tests for the new `categorize` route.
- `apps/web`: unit tests for `passcode.ts` and the new accent module (mirroring `theme.ts`'s existing spec structure), component tests for `PasscodeGate.svelte`, extended `ListMenu.svelte` tests for the passcode form, extended list-detail page tests for gated/unlocked rendering, extended list-index tests for the lock badge, extended `items.ts` tests for the categorize-endpoint call + offline fallback, extended Settings tests for the accent picker. Any new cross-file `vi.mock` coverage-attribution artifacts get the same documented `/* v8 ignore */` treatment as the existing `selected-store.ts`/`token.ts` precedent, not a lowered threshold.

## 7. Implementation order

1. Backfill Phase 6 status note in `PLAN.md`.
2. Write `foundational/PHASE7_PLAN.md` (this design doc, committed alongside the code per the Phase 4/5 precedent).
3. Passcode lock: migration → validator/transformer/DTO → `ListMenu` set/change/remove UI → `passcode.ts` → `PasscodeGate.svelte` → list-detail gating → list-index lock badge → tests.
4. Personalized categorization: `category_suggestion_service.ts` → `resolveCategoryId` refactor → new route/DTO → `items.ts` client call + offline fallback → tests.
5. Extra themes: `layout.css` palette blocks → accent module → `app.html` bootstrap update → Settings accent picker → tests.
6. Perf/a11y hardening: axe-core e2e spec, Lighthouse harness script, wire both into `ci.yml`, run, triage, fix, iterate.
7. Append the closing Phase 7 status note to `PLAN.md` (§16-style — what shipped, what the hardening pass actually found/fixed).
8. Full verification pass (below).

## Verification

- `pnpm -r lint` / `pnpm -r typecheck` / `pnpm -r test` clean, both workspaces still at 100% coverage.
- `pnpm --filter @everylist/web test:e2e` (now includes the new accessibility spec) and `pnpm --filter @everylist/web test:lighthouse` both green.
- Manual click-through against the dev servers: set a list passcode, confirm the body locks on reload, unlock with the correct PIN, confirm wrong PIN is rejected, confirm "Remove passcode" from the always-visible `ListMenu` clears it; switch accent theme and confirm no FOUC on reload and correct persistence; add an item with a name previously categorized differently than the static keyword table suggests, confirm the personalized category wins.
- `docker build` + boot smoke test (existing `ci.yml` `docker-smoke` job) still passes unchanged.
