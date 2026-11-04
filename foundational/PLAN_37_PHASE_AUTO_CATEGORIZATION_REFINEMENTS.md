# Phase 37 — Auto-categorization refinements

## Status

This is a follow-up to
[`PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md`](PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md),
split into two independent phases that must ship as **separate branches / PRs** — they fix
unrelated problems and should not be mixed:

- **Phase A — Rarity-weighted learned scoring. Implemented and merged** (#288): shared scoring
  change, regression tests, no schema change.
- **Phase B — Remove the runtime static tier, seed the learned model. Implemented** on
  `feature/seed-starter-category-learnings`: the keyword table becomes single-word seed data for
  the learned model at list creation, and both the server and offline static resolvers are
  deleted. No schema change; existing lists are ignored.

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
2. **The static fallback is a second, hard-coded matcher.** It is keyed to default category
   identities, runs alongside the learned model, and needs its own plumbing. Renaming a seeded
   category silently disables it (not the immediate cause here, but it is not fit for purpose).
   Phase B removes it and seeds the learned model instead.

## Decisions

- **Phase A uses inverse-document-frequency / distinctiveness weighting of tokens.** A token that
  is learned into only one category is highly informative; one spread across five is nearly noise.
- **Phrase/n-gram learning is rejected.** It was considered in Phase 17's research and discounted
  as too costly for category matching (row explosion, SQLite limits); it belongs in a real search
  engine, not this model. Rarity weighting gets the same "sub-match wins" behaviour without storing
  phrases.
- **Phase B deletes the runtime static tier instead of re-keying it.** The keyword table becomes
  one-time seed data attached to the created category IDs; there is no second matcher, no
  stable-key column, and no runtime name/key lookup. Kept as a separate phase/PR.
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
- If every matched token has the same `df`, all scores receive the same `1 / df` scale; ordering
  and the margin behave as before. Only `df = 1` preserves the old numeric scores — this is a
  re-weighting, not a new decision rule.
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

## Phase B — Seed the learned model instead of a runtime static tier

### Problem

Tier 2 is a second, parallel matcher keyed to hard-coded starter-category identities. Giving that
mapping stable keys (the original proposal for this phase) fixes renames but keeps the real
problem: two matchers, a hand-maintained keyword→category mapping, and extra schema/DTO/offline
plumbing that exists only to keep the fallback alive. It also has no per-list signal, so it cannot
learn from how the user actually categorises things.

The learned model already has everything this tier needs: per-list storage attached to category
IDs, decay, distinctiveness weighting, offline sync, and user-only learning. The right move is to
seed that one model at list creation and delete the runtime static tier.

### Design

**Shared (`packages/shared`)**

- Keep `StarterCategoryKey` / `STARTER_CATEGORY_KEYS` and export the keyword table as
  `STARTER_CATEGORY_KEYWORDS: Record<StarterCategoryKey, readonly string[]>`. It is **seed data**
  now, not a runtime matcher.
- **Single-word keywords only.** Drop every multi-word phrase (`'sour cream'`, `'ice cream'`,
  `'peanut butter'`, …). Phase A's distinctiveness weighting does the heavy lifting for names that
  contain several common words, and this keeps the seed data aligned with the tokenizer the model
  actually uses.
- Remove `suggestCategoryName` / `suggestStarterCategoryKey`. There is no runtime keyword lookup.

**API (`apps/api`)**

- `seedStarterCategories` keeps creating the 8 categories, and for each category with a starter
  key seeds `category_learnings` from that key's keyword list:
  - tokenise each keyword with `tokenizeItemName`, sum duplicate tokens per category (so
    `berry`/`berries` become one `berry` row with count 2), and insert one row per token with
    `lastSeenAt = now`;
  - write through the same transaction client the categories are created with;
  - skip when the list has `useCategoryLearning === false`.
- `suggestCategoryId` drops tier 2 entirely: learned match, else `null`.
- **No schema change** — no `starter_key` column, no DTO/transformer edits, no migration.
- **Existing lists are ignored** (explicit decision): there is no safe seed marker, so no backfill.
  They keep working from their existing learned rows; a keyword-only item that was never taught may
  now be uncategorised until the user assigns it once.

**Web (`apps/web`)**

- Delete `staticGuessCategoryId`. The offline fallback reads the cached learned model (with the
  existing explicit-deleted-category filtering) and returns `null` when nothing matches.
- Seeded rows arrive through the existing `/category-learnings` sync; no new client plumbing.

**Why this is not just moving the problem:** the keyword table is resolved to category IDs exactly
once, at seed time. Renames and deletes can no longer desync it (learnings follow the ID and
cascade on delete), the runtime has one matcher instead of two, and user assignments strengthen or
override the seeded prior through the normal learned path.

### Edge cases

- Seeded rows are ordinary learnings: they decay (floored, so they persist), increment when the
  user confirms the same category, and lose to the `MARGIN` rule when a common token is contested.
- A list created with learning disabled gets no seeded rows; enabling learning later starts from an
  empty model rather than a stale keyword table.
- Plural collapse means some keywords merge (berry/berries, bean/beans, egg/eggs) — intended, and
  the count reflects both entries.
- Deleting a seeded category cascade-deletes its learned rows, so the suggestion disappears.

### Files

- `packages/shared/src/auto-categorize.ts` — export the keyword table, drop the static matcher.
- `packages/shared/tests/auto-categorize.test.ts` — table/single-word guards, static-matcher tests
  removed.
- `apps/api/app/services/category_service.ts` — seed learnings alongside starter categories.
- `apps/api/app/services/category_suggestion_service.ts` — remove the static tier.
- `apps/api/tests/functional/category_learnings.spec.ts`, `items.spec.ts` — seeded-list coverage.
- `apps/web/src/lib/api/items.ts`, `items-offline.spec.ts` — learned-only offline fallback.

### Testing

- Shared: every `StarterCategoryKey` has a non-empty keyword list; every keyword is a single word.
- API: seeding writes the expected token→category rows (including plural merges); a renamed seeded
  category still suggests; deleting it drops the rows and returns `null`; a user-created category
  is never matched; learning disabled seeds nothing; a list with categories but no learnings returns
  `null` (proving the static tier is gone).
- Web: cached seeded learnings drive the offline guess; no match returns `null`; the
  deleted-category filter still applies.
- 100% statements/branches/functions/lines.

### Verification

- New seeded list: "Bananas" → Produce; rename Produce → "Fruit & Veg" and add "Apples" → the
  renamed category; delete it and add "Bananas" → uncategorised.
- Existing list: no static bootstrap, but previously learned associations still work.
- `pnpm check --skip-e2e` clean; CI runs the browser suite.

## Out of scope

- Phrase/n-gram learning or any search-engine-style indexing (rejected — see Decisions).
- A user-facing keyword/alias editor per category (a possible later feature, not part of either
  phase).
- Changing `MARGIN`, the decay half-life or the decay floor.
- Backfilling seeded learnings into existing lists (explicit decision: they are ignored).
- Multi-word/phrase keywords (single words only, by decision).

## Implementation order

1. **Phase A branch/PR:** shared formula + tests → API/web regression tests → docs. Merged in #288.
2. **Phase B branch/PR:** shared keyword table + single-word cleanup → API seeding and deletion of
   the static tier → web learned-only offline fallback → tests → `pnpm check`.

Each phase is independently releasable. Keep the diffs disjoint: Phase A touches scoring only;
Phase B touches the keyword seed data and removes the static tier only.

## Verification (both phases)

- `pnpm check` (the full PR gate) on each branch before opening the PR; `pnpm check --skip-e2e` for
  iteration.
- Phase B has no migration to reproduce.
- Manual repro from the report: "Peckish Rice Crackers Original" and "Peckish rice crackers plain"
  both land in Cookies & Biscuits after Phase A.
