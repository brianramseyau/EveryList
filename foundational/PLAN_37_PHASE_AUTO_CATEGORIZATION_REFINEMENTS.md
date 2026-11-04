# Phase 37 — Auto-categorization refinements

## Status

This is a follow-up to
[`PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md`](PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md),
split into two independent phases that must ship as **separate branches / PRs** — they fix
unrelated problems and should not be mixed:

- **Phase A — Rarity-weighted learned scoring. Implemented** on
  `feature/auto-categorization-rarity-weighting` (shared scoring change, regression tests, no
  schema change).
- **Phase B — Static fallback rework. Not started.** Replaces the runtime lookup by hard-coded
  category _display names_ with stable starter-category keys. Adds one nullable column;
  independent of A.

Merge order: A first (it is the user-visible bug), then B.

## Context

A user added **"Peckish Rice Crackers Original"** and it landed in **uncategorised**, even though
**"Peckish rice crackers"** had previously been categorised as **Cookies & Biscuits**.

The tokenizer is not at fault. `tokenizeItemName` splits the whole name and
`rankCategoryLearnings` sums over the token set, order-independent — all words are used, none are
weighted by position, and an unmatched token is simply ignored (`packages/shared/src/item-name-tokens.ts`,
`packages/shared/src/auto-categorize.ts`). `original` contributed nothing here (the only `original`
learning was in a different list and is list-scoped), but it did not cause the failure either.

The real model state for the affected list (`list_id = 1`) was:

| token     | category              | count | last seen  |
| --------- | --------------------- | ----- | ---------- |
| `peckish` | Cookies & Biscuits    | 1     | 2026-08-29 |
| `cracker` | Cookies & Biscuits    | 3     | 2026-10-06 |
| `cracker` | Stock & Gravy         | 1     | 2026-08-24 |
| `rice`    | Cookies & Biscuits    | 1     | 2026-08-29 |
| `rice`    | Grains, Pasta & Sides | 3     | 2026-10-02 |
| `rice`    | Breakfast Cereal      | 2     | 2026-10-02 |
| `rice`    | Stock & Gravy         | 1     | 2026-08-24 |
| `rice`    | International         | 1     | 2026-09-12 |

Every token has equal weight, so the common token `rice` lifts _several_ categories at once while
the distinctive token `peckish` is drowned out:

| category              | raw score |
| --------------------- | --------- |
| Cookies & Biscuits    | 4.24      |
| Grains, Pasta & Sides | 2.65      |
| Breakfast Cereal      | 1.76      |
| Stock & Gravy         | 1.52      |
| International         | 0.82      |

`pickLearnedCategoryId` requires the winner to beat the runner-up by `MARGIN` (2×):
4.24 < 2 × 2.65 = 5.30, so it returns `null`. The static fallback then maps `rice`/`cracker` to the
category _name_ **Pantry**, which this list no longer has (presumably renamed to "Grains, Pasta &
Sides"), so it resolves to `null` → uncategorised.

Two distinct defects fall out of this:

1. **Scoring ignores token distinctiveness.** "Peckish rice crackers" is effectively a sub-match of
   "Peckish Rice Crackers Original", but the additive equal-weight sum lets the generic word `rice`
   decide the outcome. Any future variant ("Peckish rice crackers plain") fails the same way.
2. **The static fallback is keyed to hard-coded display names.** Renaming a seeded category breaks
   it silently. It was not the immediate cause (tier 1 ran first and abstained), but it is not fit
   for purpose.

## Decisions

- **Phase A uses inverse-document-frequency / distinctiveness weighting of tokens.** A token that
  is learned into only one category is highly informative; one spread across five is nearly noise.
- **Phrase/n-gram learning is rejected.** It was considered in Phase 17's research and discounted
  as too costly for category matching (row explosion, SQLite limits); it belongs in a real search
  engine, not this model. Rarity weighting gets the same "sub-match wins" behaviour without storing
  phrases.
- **Phase B replaces name-keyed lookup with stable starter-category keys**, not another name table.
  Kept as a separate phase/PR.
- `HALF_LIFE_MS`, `DECAY_FLOOR` and `MARGIN` stay as they are in Phase A.

---

## Phase A — Rarity-weighted learned scoring

### Problem

`rankCategoryLearnings` currently scores a category as
`Σ count · decayWeight(age)` over every matched token. All tokens count equally, so a common word
that has been assigned to many categories raises the runner-up as much as it raises the winner.
The distinctive token in a longer name can never break the margin. This breaks the intuitive
"inherits from the matched sub-phrase" behaviour the user expects.

### Design

In `packages/shared/src/auto-categorize.ts`, compute a per-token spread from the learnings passed in:

```
df(token) = number of distinct categoryIds with a learning row for that token
```

Then weight each contribution by `1 / df(token)`:

```
score(category) = Σ over matched learnings
                    count · decayWeight(now − lastSeenAt) / df(token)
```

Ranking and tie-breaking stay exactly as today (score desc, then `lastSeenAt` desc).
`pickLearnedCategoryId`, `MARGIN`, `DECAY_FLOOR` and `HALF_LIFE_MS` are unchanged, so the
"uncontested association always wins" and "ambiguous ⇒ abstain" semantics still hold.

Worked result on the reported data (same decay as the investigation):

| category              | weighted score |
| --------------------- | -------------- |
| Cookies & Biscuits    | 2.27           |
| Grains, Pasta & Sides | 0.53           |
| Stock & Gravy         | 0.53           |
| Breakfast Cereal      | 0.35           |
| International         | 0.16           |

`2.27 ≥ 2 × 0.53`, so Cookies & Biscuits wins. The same holds for "Peckish rice crackers plain":
the extra unmatched token is ignored and `peckish` still dominates.

Why this is the right lever: a token that only ever means one category has `df = 1` and keeps its
full weight; `rice` with five categories has weight 1/5. The longest, most specific part of the
name therefore carries the decision, which is the behaviour phrase inheritance was meant to give,
without any phrase storage.

### Edge cases

- Compute `df` from the `learnings` argument, which is already filtered to active categories by
  `getCategoryLearnings` (and is the cached, active-filtered set offline). Soft-deleted categories
  must not inflate a token's `df`.
- `df = 0` for a token with no rows: it is not matched, so no division occurs.
- If every matched token is equally spread (e.g. all `df = 1`), scores reduce to the old sum and
  the margin behaves as before — this is a re-weighting, not a new decision rule.
- `count` and decay still matter _within_ a category; only cross-category spread is new.
- Single-category models (only one category has any learning) are unaffected — still uncontested.

### Files

- `packages/shared/src/auto-categorize.ts` — formula + header comment.
- `packages/shared/tests/auto-categorize.test.ts` — updated expectations plus new cases.
- `apps/api/app/services/category_suggestion_service.ts` — no signature change; add/adjust a
  regression test with the reported rows and assert Cookies & Biscuits.
- `apps/web/src/lib/api/items.ts` — no code change (it calls the same shared function); add an
  offline `guessCategoryId` regression test proving the cached path agrees with the server.
- Documentation: update the `auto-categorize.ts` header and add a short follow-up note to PLAN_17
  (not a rewrite of it).

### Testing

- `rankCategoryLearnings`: distinctive token outweighs a common one; a token's `df` is the number
  of distinct categories (not row count); decay/count still compose correctly; ties still break by
  `lastSeenAt`.
- `pickLearnedCategoryId`: regression for the exact reported learning rows → Cookies & Biscuits;
  "plain" variant → Cookies & Biscuits; genuinely ambiguous case (two equally distinctive
  categories) still returns `null`.
- API service matrix: learned hit through the new weighting, active-category filtering still
  applies, fallback/no-match unchanged.
- Web offline fallback: same regression via the cached learnings.
- Maintain 100% statements/branches/functions/lines.

### Verification

- Add "Peckish Rice Crackers Original" to a list seeded with the reported learnings → Cookies &
  Biscuits.
- Add "Peckish rice crackers plain" → Cookies & Biscuits.
- Confirm a two-category tie (e.g. two equally weighted distinctive tokens) still abstains.
- `pnpm check --skip-e2e` clean.

---

## Phase B — Static fallback rework (stable starter-category keys)

### Problem

`KEYWORDS_BY_CATEGORY` maps keywords to hard-coded default category _names_ (`Pantry`, `Dairy`,
…). `suggestCategoryId` then looks for a category whose `name` matches exactly; the web's
`staticGuessCategoryId` does the same against Dexie. Renaming a seeded category — a first-class,
supported action — silently disables the fallback for that category. The reported list's "Pantry"
had been renamed, so `rice`/`cracker` resolved to `null`.

### Design

Give seeded categories a **stable identity** that survives renames, and key the static table to
that identity instead of the display name.

**Shared (`packages/shared`)**

- Introduce a `StarterCategoryKey` union: `'produce' | 'dairy' | 'meat' | 'bakery' | 'frozen' |
'pantry' | 'household'`.
- Re-key `KEYWORDS_BY_CATEGORY` by `StarterCategoryKey` (same keyword lists and the same
  longest-keyword-wins matching).
- Replace `suggestCategoryName(itemName)` with `suggestStarterCategoryKey(itemName)`, typed as
  `StarterCategoryKey | null`. Keep the multi-word keyword matching (`'sour cream'`, `'ice cream'`,
  …) — phrase precision is why this tier still exists.

**API (`apps/api`)**

- Migration: add a nullable `starter_key` column to `categories` (plain string, **no FK** — the
  safe `ALTER` shape) and backfill it with `this.defer(...)` (same-migration DDL + data writes must
  never be a bare `this.db` call; see AGENTS.md):
  - primary: case-insensitive `name` match against the starter names;
  - secondary: `icon` match against the starter icons, for categories renamed by the user that kept
    their starter icon (this catches the reported "Pantry → Grains, Pasta & Sides" case);
  - skip ambiguous matches (two categories claiming the same key) rather than guessing.
- `STARTER_CATEGORIES` in `category_service.ts` gains the matching `key`, and
  `seedStarterCategories` writes `starterKey` on new lists.
- `suggestCategoryId` tier 2: `suggestStarterCategoryKey` → find an **active** category whose
  `starterKey` matches; fall back to the old exact-name lookup for rows the backfill couldn't
  identify. `null` if neither resolves.
- `CategoryTransformer` + `CategoryDto` expose `starterKey` (nullable) so the client can resolve
  the same way offline. Additive response field — allowed under `/api/v1` without a version bump.

**Web (`apps/web`)**

- Add `starterKey` to the cached category type (non-indexed field; no Dexie index bump needed).
- `staticGuessCategoryId` resolves `suggestStarterCategoryKey` against cached categories by
  `starterKey`, falling back to name, mirroring the server.

**Scope note:** user-created categories have `starterKey = null` and are never matched by the
static tier — that is correct; they are served by the learned tier. A category renamed _and_
re-iconed before this migration cannot be identified by name or icon and stays unmapped; document
that limitation rather than guessing.

### Migration / footgun notes

- `ALTER TABLE categories ADD COLUMN starter_key` is a plain nullable add — no inline FK, so it
  does not trigger the table-rebuild cascade described in AGENTS.md. Still reproduce it against a
  seeded SQLite file per the migration protocol (add representative categories, run only this
  migration, confirm children and rows survive).
- The backfill must run inside `this.defer(...)` because the column DDL is deferred until `up()`
  returns.
- No route changes, so `.adonisjs` regeneration is not required for this phase.

### Testing

- Shared: each keyword maps to the right `StarterCategoryKey`; longest keyword still wins;
  unknown names → `null`.
- API: resolver finds a renamed category by `starterKey`; legacy rows with no key still resolve by
  name; deleted categories are ignored; user categories are never matched; seed writes keys;
  migration backfill covers name match and icon fallback and leaves ambiguous cases null.
- Web: offline guess resolves by `starterKey` from Dexie and falls back to name.
- DTO/transformer: `starterKey` present and nullable.
- Migration reproduction against a seeded SQLite file (above).
- Maintain 100% coverage; `pnpm check --skip-e2e` clean.

### Verification

- Rename `Pantry` → `Grains, Pasta & Sides` on a fresh list, then add an item with a static keyword
  (`rice`) → resolves to the renamed category rather than `null`.
- Existing lists upgraded by the migration: categories that still have their starter name or icon
  gain the key; unrelated categories stay `null`.
- Offline: same resolution from the cached categories.

---

## Out of scope

- Phrase/n-gram learning or any search-engine-style indexing (rejected — see Decisions).
- A user-facing keyword/alias editor per category (a possible later feature, not part of either
  phase).
- Changing `MARGIN`, the decay half-life or the decay floor.
- Recovering mappings for categories renamed _and_ re-iconed before Phase B.

## Implementation order

1. **Phase A branch/PR:** shared formula + tests → API/web regression tests → docs. Merge first.
2. **Phase B branch/PR:** shared keys → migration + model/schema/seed/transformer → service →
   web → `pnpm check`.

Each phase is independently releasable. Keep the diffs disjoint: Phase A touches scoring only;
Phase B touches the static tier and category metadata only.

## Verification (both phases)

- `pnpm check` (the full PR gate) on each branch before opening the PR; `pnpm check --skip-e2e` for
  iteration.
- Run the migration reproduction for Phase B against a seeded SQLite file.
- Manual repro from the report: "Peckish Rice Crackers Original" and "Peckish rice crackers plain"
  both land in Cookies & Biscuits after Phase A.
