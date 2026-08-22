# AGENTS.md

Guidance for AI coding agents working in this repo. This is the single source of truth for agent-facing instructions — `CLAUDE.md` (and any other tool-specific file) just points here. Don't duplicate this content elsewhere.

## What this app is

EveryList is a self-hosted, mobile-first, offline-first shopping-list PWA — see [`foundational/PLAN.md`](foundational/PLAN.md) for the full product plan and rationale, and [`README.md`](README.md) for a quick overview. Single Docker image, single process, single SQLite file under `/config`, no premium tier.

## Monorepo layout

```
apps/api/       AdonisJS 6 backend (Lucid ORM, VineJS validation, Transmit/SSE)
apps/web/       SvelteKit frontend (Svelte 5, static adapter, Flowbite Svelte, Dexie offline store)
packages/shared DTOs/contracts shared between API and web
docker/         Container build; root/etc/cont-init.d/* are s6-overlay boot scripts (migrations, seeding)
foundational/   PLAN.md and phase plans — the product/architecture spec
```

## Stack essentials

- Database: **SQLite 3 (WAL)** via `better-sqlite3`, one file (`/config/everylist.sqlite3` in prod). No Postgres/MySQL — don't suggest one.
- Migrations run automatically on every container boot (`docker/root/etc/cont-init.d/30-migrate`), against a live, populated production database. There is no staging step — a bad migration hits prod directly. Treat every migration as production-critical; see the SQLite footgun below before writing one that alters an existing table.
- 100% test coverage is enforced in CI on both `apps/api` (c8/v8, `.c8rc.json`) and `apps/web` (Vitest, `vite.config.ts`) — statements/branches/functions/lines. `pnpm lint` (prettier --check + eslint) and `pnpm typecheck` must also be clean.
- Shared DTOs live in `packages/shared` — validators/transformers on the API side and API-response types on the frontend side should both trace back to those, not redeclare shapes locally.

## Known footguns

### SQLite `ALTER TABLE` + `PRAGMA foreign_keys=ON` can silently cascade-delete production data

**Incident (2026-08-15):** migration `1786567158000_add_folder_id_to_lists_table.ts` added a foreign-key column to `lists`. SQLite implements that kind of `ALTER TABLE` by rebuilding the table (create new, copy rows, **drop the old one**, rename). The app's DB connection had `PRAGMA foreign_keys = ON` set unconditionally, including during migrations — so dropping the old `lists` table cascade-deleted every row in `items`, `list_members`, and other tables with `onDelete('CASCADE')` pointing at `lists.id`. This wiped real production data (all items and memberships on every list) the moment the migration ran on container boot. The `lists` row itself survived the rebuild, which made the bug look like "a list vanished" when actually its children were gone and it just had no members left to make it visible.

**Fix:** [`apps/api/config/database.ts`](apps/api/config/database.ts) now only enables `foreign_keys` enforcement outside the `console` (ace/migration) environment — `web` and `test` still enforce it correctly (needed for real behavior like a folder delete SET NULL-ing `lists.folder_id`), but migrations no longer risk cascade deletes as a side effect of a table rebuild.

**What this means for future work:**

- Any new migration that runs `alterTable` to **add a column with an inline FK reference** (`.references(...).inTable(...)`) on a table that has children with `onDelete('CASCADE')` is the exact shape that triggers this. The fix above closes the general case, but if you're touching migration/DB config again, verify the fix is still in place before assuming it's safe.
- Before merging any migration that alters an existing (non-empty-in-prod) table, reproduce it against a seeded SQLite file locally first: build the schema at the pre-migration state, insert representative rows into parent + child tables, run just the new migration, and confirm child rows survive. Don't rely on the test suite alone — Japa tests run against a fresh empty schema every time and won't catch this class of bug.
- There were no production backups configured as of this incident. **Update (2026-08-22): fixed** — see `app/services/backup_service.ts`, configurable from `Settings → Backups` (daily/weekly/monthly, a chosen time of day, and a retention window in days), taken via better-sqlite3's native online backup API so it's safe to run against a live database. Still treat schema changes conservatively — a restore is now possible, but is not the same as a schema change being risk-free.

### Realtime SSE broadcasts can silently miss the first write after a fresh server boot

**Status (2026-08-22): open, unresolved — needs investigation, not yet reproduced to a root cause.**

While manually testing Personal Access Tokens (Phase 16), a PAT-authenticated write to
`POST /lists/:listId/items` didn't push a live update to a browser tab subscribed to that list's
`list/:id` Transmit channel — the item was created (200, correct data, `broadcastSync` ran), but
the subscriber never saw it without a manual refresh.

Reproduced directly with curl against `apps/api/start/transmit.ts`'s subscribe protocol
(`GET __transmit/events?uid=...` + `POST __transmit/subscribe` with a matching `uid`/`channel`),
bypassing the frontend entirely:

- **Ruled out**: this is not PAT-specific. The identical miss reproduced with a plain login
  session token — no PAT involved at all — on the *first* write immediately after a fresh
  `node ace serve` boot, in both `--hmr` and static mode.
- Once a process had handled at least one broadcast successfully (directly via
  `transmit.broadcast()` or through a real write), every subsequent write in that same process
  broadcast reliably — PAT or session token, no further misses observed.
- Subscriber registration itself was confirmed correct at the time of the miss (queried
  `transmit.getSubscribersFor('list/:id')` directly and the uid was present), so the gap is
  somewhere between a confirmed-registered subscriber and message delivery on that first
  broadcast — not an auth/authorization problem in `authorizeListChannel`.

**What this means for future work:**

- Don't assume a single manual "it didn't update live" observation is a PAT/auth bug — check
  whether it's actually this first-broadcast-after-boot gap first (try the same action again
  without restarting the server).
- This directly affects the co-shopping field test noted as still-unconfirmed after PR #76 — a
  session that starts with a fresh deploy/restart is exactly when this would bite.
- Next step for whoever picks this up: instrument `@boringnode/transmit`'s `Stream`/`StreamManager`
  (vendored under `node_modules/.pnpm/@boringnode+transmit@*`) to find out why the first
  `subscriber.writeMessage()` call after boot doesn't reach an already-piped response, when
  identical calls immediately afterward do.

### Re-adding a deleted item's name silently lost its store/price/quantity/notes

**Status (2026-08-22): fixed.** `items_controller.ts#store` used to dedup only against *active*
items (`whereNull('deletedAt')`), so typing/autocomplete-adding a name that matched a deleted item
created a fresh, metadata-less row instead of reusing the old one — unlike the explicit
`/lists/:id/recently-deleted` → `restoreItem()` restore flow, which always preserved
`categoryId`/`storeId`/`price`/`quantity`/`notes` because it operates on the same row.

Fix: when `store()` finds no active match, it now also checks for the most recently *deleted*
match and restores that row (via a `restoreItemRow` helper shared with the explicit `restore()`
endpoint) instead of creating a new one. This applies to both the autocomplete-pick and
typed-and-submitted paths, since the frontend already funnels both through the same
`POST .../items` call — no frontend or DTO changes were needed. See
`apps/api/tests/functional/items.spec.ts`'s `"re-adding a deleted item's name restores its old
row..."` test.

If this resurfaces: check whether `store()`'s deleted-match lookup is still in place before
assuming it's the same bug — a regression here would look identical to the original report (price/
store/quantity/notes missing after re-adding a name).

### Offline-sync E2E test can intermittently see a duplicate row on CI (not locally)

**Status (2026-08-22): open, unreproduced locally — suspected pre-existing race, not yet fixed.**

`apps/web/e2e/offline-sync.e2e.ts`'s "adds an item while offline and syncs it once back online" failed
once in CI (Phase 16 PR #79) with a Playwright strict-mode violation: `getByText('Milk')`
resolved to *two* elements right after `page.reload()`, where the test expects exactly one.

- **Ruled out as caused by that PR's own diff**: the PR touched only `apps/api` auth/token/policy
  code, `start/limiter.ts`, and the new `settings/tokens` page — nothing under
  `apps/web/src/lib/offline/`, `lib/api/items.ts`, or the list page's flush/reload handling.
- **Not reproduced locally**: the same test run 6 times back-to-back (3× solo, 3× alongside the
  rest of the suite at 2 workers, matching CI's concurrency) — 6/6 passed every time.
- **Matches a known-tricky area**: this exact class of bug — a local/Dexie optimistic row not
  cleared before a reload lands — was fixed once already (`Fix offline sync DOM visibility and
  self-conflicting edits`, #72). The likely mechanism: the "Server unavailable" indicator
  clearing and the flush queue actually draining are two independent async signals (see
  `+page.svelte`'s `onFlushOutcome`) — a `page.reload()` timed between them could catch a stale
  Dexie temp row still present alongside the just-synced server row. CI's slower I/O plausibly
  widens that window enough to hit; a fast local machine may not.

**What this means for future work:**

- If this reappears, don't assume it's a fresh regression from whatever PR is open at the time —
  check first whether the diff touches offline-sync code at all.
- Whoever picks this up: instrument the gap between the connectivity indicator clearing and the
  flush's Dexie cleanup actually completing (`lib/offline/flush.ts`'s `onFlushOutcome` and
  whatever clears the dirty/temp row) to find the real race window, rather than just adding a
  wait to the test — the test caught a real (if narrow) gap.

## Working conventions

- Full-stack features go migration → backend (model/validator/controller/policy) → shared DTO → frontend, in that order — see any `Phase 6:` commit for the pattern.
- **Run `pnpm check` before opening a PR.** It mirrors the GitHub Actions PR gate (`.github/workflows/ci.yml` → `test.yml`, plus the `e2e` job — see `foundational/PLAN.md` §12): builds `@everylist/shared`, lints and typechecks every workspace, installs Playwright Chromium, runs every workspace's coverage-gated test suite, then the web E2E suite. `pnpm check --skip-e2e` drops the E2E suite for fast iteration. This catches issues locally instead of burning (at times multiple) CI round trips. Only the CI `docker-smoke` job (production Docker image build + smoke test) isn't reproducible this way — it needs Docker. (Lighthouse's CI gate was removed in PR #30 — `scripts/lighthouse-check.mjs` still exists for manual/local runs, but nothing in CI invokes it.)
- Don't force-push, don't skip hooks, don't merge/deploy without explicit confirmation — this is a solo-maintained app with no staging environment, so anything that touches `main` effectively touches production on the next deploy.
