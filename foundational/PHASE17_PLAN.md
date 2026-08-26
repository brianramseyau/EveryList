# Phase 17 — Learned auto-categorization

## Context

The auto-categorizer is a two-tier matcher in `apps/api/app/services/category_suggestion_service.ts`: a "personalized" tier that derives a category from past `Item` rows (case-insensitive exact name → most-frequent `categoryId`), and a static keyword table in `packages/shared/src/auto-categorize.ts` as fallback. This was the Phase 7 fallback from an originally-planned ML model ("frequency-based, not a trained ML model", PHASE7_PLAN.md §3).

Four defects motivate replacing it:

1. **The learned signal is derived, not stored** — it reads from `items`, so it dies whenever items are purged, and it forces items to be kept forever to preserve learning (DB bloat).
2. **Exact-name matching** — "Apple"/"Apples" and "2% milk"/"Milk 1 gal" don't collide, so the user has to micro-manage variants.
3. **No decay/ranking** — recency is ignored; ties are non-deterministic; a historically-common-but-now-soft-deleted category can still be suggested (no active-category filter).
4. **Offline is a second-class citizen** — the personalized tier is server-only; the offline client falls back to the static table, so a user's learned categories don't apply while offline.

Decisions locked in with the user before implementation:

- **Dedicated `category_learnings` table** (no ML model, no third-party classifier). The hard part is dedup/rank/decay/never-forget, which no off-the-shelf NB library actually provides; a table + a small shared normalizer does.
- **Exponential half-life decay with a floor, rows never deleted.** An *uncontested* association always wins regardless of decay, so a two-year-dormant mapping still categorizes (the AnyList "forgot my item" gap, explicitly closed). Defaults: `HALF_LIFE = 180 days`, `DECAY_FLOOR = 0.05`, `MARGIN = 2×`.
- **Explicit-user-assignment-only learning.** The model learns only when the user *chooses* a category (explicit `categoryId` on create/update, import section headers, favorite defaults) — never from the auto-suggestion itself, avoiding self-reinforcement.
- **Backfill all existing history** (the seed can't distinguish explicit vs auto, and is accepted as such).
- **Read-only client sync, server-authoritative learning.** The server is the single source of truth; the client caches a read-only copy of the model for offline use. Learning is applied server-side (an offline categorization still teaches the model when its queued mutation flushes).

## Shared — `packages/shared` (single source of truth for the classifier)

- **New `src/item-name-tokens.ts`**: `normalizeItemName()` (lowercase, Unicode-normalize, strip punctuation, collapse whitespace) and `tokenizeItemName()` (split → drop non-letter tokens → `s/es/ies` plural-strip). `Apple`/`Apples`→`apple`, `Berries`→`berry`, `2% milk`/`Milk 1 gal`→`milk`.
- **Extend `src/auto-categorize.ts`** (static table stays as fallback): `rankCategoryLearnings(tokens, learnings, now)` (per-category `Σ count · max(FLOOR, e^(-ln2·age/HALF_LIFE))`, sorted by score then `lastSeenAt`) and `pickLearnedCategoryId(...)` (top category if uncontested or `best ≥ MARGIN·second`, else `null`). Constants (`HALF_LIFE_MS`, `DECAY_FLOOR`, `MARGIN`) exported once.
- **New `CategoryLearningDto`** in `src/domain.ts`: `{ categoryId, token, count, lastSeenAt }`.
- Export all from `index.ts`.

## API — `apps/api`

- **Migration** (new table, `CREATE` only — no `ALTER`, so no cascade footgun): `category_learnings(id, list_id FK lists CASCADE, category_id FK categories CASCADE, token, count, last_seen_at, created_at, updated_at, UNIQUE(list_id, token, category_id))`.
- **Backfill** (same migration): read every `Item` (incl. soft-deleted), `tokenizeItemName`, group by `list_id/category_id/token` → `count` + `last_seen_at`. Reproduce against a seeded SQLite file locally first (AGENTS.md footgun protocol).
- **`app/models/category_learning.ts`**.
- **Rework `category_suggestion_service.ts`**: `learnCategory(listId, name, categoryId)` (tokenize → upsert/increment/bump, never decrement/delete), `getCategoryLearnings(list)` (joined to active categories — fixes the stale-id bug), `suggestCategoryId(list, name)` (`pickLearnedCategoryId` → static fallback → `null`). Remove `personalizedCategoryId()`.
- **Route** `GET /lists/:listId/category-learnings` (viewer) → `{ data: CategoryLearningDto[] }`.
- **`learnCategory` call sites (explicit-only)**: `items_controller.store` (explicit non-null `categoryId`), `items_controller.update` (`categoryId` changed to non-null — covers dropdown + drag), `items_controller.import` (section-header categories only), `favorite_items_controller.addToList` (non-null `defaultCategoryId`). `moveToList` is skipped.

## Web — `apps/web` (read-only sync + offline fallback)

- **Dexie v4**: `categoryLearnings: 'listId'` (read-only, no `_dirty`).
- **`fetchCategoryLearnings(listId)`** (`$lib/api/category-learnings.ts`) via `withCacheFallback`: online → full-replace the list's rows; offline → read Dexie.
- **Wire into** `background-sync.ts` per-list refresh and the list page's `loadAll()`.
- **`guessCategoryId` offline fallback** in `items.ts`: `pickLearnedCategoryId(tokens, dexieRows) ?? static(cachedCategories)`; online path unchanged.

## Docs & references

- Update the stale `auto-categorize.ts` header comment (references nonexistent `default_category_seeder.ts` / `auto_categorize_service.ts`).
- Correct PHASE7_PLAN.md's "No new tracking table is needed" line.
- Update `README.md` and `foundational/PLAN.md` to reflect the new standing: auto-categorization is now a persisted, decayed, server-authoritative learned model synced read-only to the offline client, replacing the item-derived frequency heuristic.

## Testing (100% coverage maintained)

- **shared**: `tokenizeItemName`, `rankCategoryLearnings`, `pickLearnedCategoryId`.
- **api**: `learnCategory` upsert; `suggestCategoryId` matrix (learned hit, decay reorder, margin, fallback, no-match, active-category filter); `category-learnings` endpoint; backfill seeds correctly.
- **web**: `fetchCategoryLearnings` cache/fallback; offline `guessCategoryId` learned→static; `background-sync` + `loadAll` include learnings.

## Implementation order

1. Shared tokenizer/classifier + DTO + tests.
2. Migration + backfill + model (+ local backfill reproduction).
3. Service rewrite + delete `personalizedCategoryId`.
4. Route + `learnCategory` wiring at the four call sites.
5. Dexie v4 + `fetchCategoryLearnings` + background-sync/`loadAll`/offline fallback.
6. Docs & references update (README.md, PLAN.md, PHASE7 note, `auto-categorize.ts` header).
7. Tests + `pnpm check`.

## Verification

- `pnpm -r lint` / `pnpm -r typecheck` / `pnpm -r test` clean at 100% coverage; `pnpm check --skip-e2e` green.
- Manual: add "Apples" and confirm it lands in the same category as "Apple"; add "2% milk" and confirm Dairy; delete/purge the items and confirm re-adding still categorizes (learned table survives); go offline and confirm a previously-learned custom category is still suggested.
- `docker build` + boot smoke test unchanged.
