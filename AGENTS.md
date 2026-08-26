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

### `this.schema.createTable` is deferred — a same-migration data insert must run through `this.defer()`

**Incident (2026-08-26):** migration `1787800000000_create_category_learnings_table.ts` created the
`category_learnings` table and then, in the same `up()`, backfilled it with `await this.db.table('category_learnings').insert(...)`.
That insert failed on container boot with `no such table: category_learnings`, because AdonisJS
Lucid's `this.schema.createTable(...)` does **not** execute the DDL immediately. `this.schema` is a
getter that pushes a *deferred* schema builder onto `BaseSchema`'s `trackedCalls` queue, and the whole
queue only runs in `executeQueries()` **after `up()` returns**. The `this.db` backfill, in contrast,
ran immediately during `up()` — before the table existed. Migrations are transactional, so the failure
rolled the whole migration back cleanly (no data loss), but it meant the migration could never apply to
a populated production DB.

**Fix:** wrap any data writes that must follow a same-migration DDL change in `this.defer()`:

```ts
this.schema.createTable(this.tableName, (table) => { ... })

// Runs after the createTable above, in the order the two were tracked.
this.defer((db) => this.backfill(db))   // db: QueryClientContract
```

`defer` tracks a callback into the same queue as the schema builders, so it executes in tracked order
(DDL first, then the callback) inside the migration's transaction. Only a `CREATE`-only migration that
*also* seeds/backfills data from `this.db` hits this; pure-DDL migrations and `this.db`-only data
migrations (e.g. `migrate_default_categories_to_lists.ts`) are unaffected.

**What this means for future work:**

- Any migration that needs to **insert/update data into a table it just created** (or just altered)
  must do that data work inside `this.defer(...)`, never as a bare `await this.db...` after the
  `this.schema` call. `this.schema.createTable`/`alterTable`/`dropTable` queue their DDL; `this.db`
  executes immediately — mixing them in `up()` without `defer` is the exact shape that fails.
- The existing test suite won't catch this: Japa's `testUtils.db().migrate()` runs against a *fresh*
  empty schema, so a backfill loops over zero rows and never touches the insert path. Reproduce it
  manually like the ALTER footgun above — migrate up to the pre-migration state, seed rows, then run
  the new migration against that file (or unit-test an extracted, pure grouping helper the way
  `category_learning_backfill.ts` does).
- If a migration boots and fails with `no such table: X` where `X` is a table you create in the *same*
  migration's `up()`, this is the bug — check whether the failing write is a bare `this.db` call that
  should be wrapped in `this.defer()`.

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

**Status (2026-08-22): fixed.** `apps/web/e2e/offline-sync.e2e.ts`'s "adds an item while offline
and syncs it once back online" failed once in CI (Phase 16 PR #79) with a Playwright strict-mode
violation: `getByText('Milk')` resolved to *two* elements right after `page.reload()`, where the
test expects exactly one.

Root cause: `connectivity.svelte.ts`'s own `online` listener and `flush.ts`'s own `online`
listener both race to clear the "Server unavailable" indicator on reconnect. The connectivity
listener calls `pingNow()` (a single cheap `/api/v1/ping` round trip); the flush listener calls
`attemptFlush()`, which replays the queued create — a slower `POST` — and only *then* deletes the
optimistic temp row from Dexie (`flush.ts`'s `replay()`). The ping routinely wins, clearing the
indicator before the temp row is gone. `page.reload()` timed right after the indicator clears (as
the test does, matching real usage — the indicator is the natural "safe to reload" signal) could
land in that gap: `fetchItems()` (`lib/api/items.ts`) merges any still-`_dirty` Dexie row into the
server's fresh list on the assumption it's an unsynced local edit, so the not-yet-deleted temp row
got appended alongside the now-synced server row — the observed duplicate. CI's slower I/O widened
the gap enough to hit it; a fast local machine usually replays+deletes before the ping resolves,
which is why 6/6 local runs passed even before the fix.

Fix: `pingNow()` (`lib/offline/connectivity.svelte.ts`) no longer clears `serverUnavailable` on a
bare successful ping if `pendingMutations()` (`lib/offline/sync-queue.ts`) is non-empty — in that
case a drain is in flight or about to be scheduled, and `onFlushOutcome`'s `ok: true` (fired only
after `flushQueue` fully drains, including each mutation's Dexie cleanup) is left as the sole
signal that clears the indicator. See `connectivity.svelte.spec.ts`'s "stays unavailable after a
successful ping while a queued mutation is still draining".

**If this resurfaces:** don't assume it's a fresh regression from whatever PR is open at the
time — check first whether the diff touches offline-sync code, and whether `pingNow()` still
checks `pendingMutations()` before clearing `serverUnavailable` (a regression there would
reproduce this exact symptom).

### Sortable-prototype E2E test can intermittently see a duplicate row on CI (not locally)

**Status (2026-08-22): mitigated, root cause unconfirmed.** `apps/web/e2e/sortable-prototype.e2e.ts`'s
"keeps a multi-step same-category reorder stable across reloads" failed once in CI (PR #83, unrelated
to that PR's own diff — a connectivity-monitor fix) with the same shape of Playwright strict-mode
violation as the offline-sync flake above: `getByText('Charlie Item', { exact: true })` resolved to
*two* elements right after the test's second `page.reload()`.

- **Not reproduced locally** despite substantial effort: 60 back-to-back runs (30× each of both
  tests in the file) all passed; artificially delaying the drag's PATCH response by up to 5s (to
  widen any race between the optimistic Dexie write, the request settling, and the reload) never
  produced a duplicate, only ever 0 or 1 matches.
- **The obvious theory doesn't hold up under test**: `handleItemDrop` → `updateItem` →
  `offlineMutate` is an `op: 'update'` (not `'create'`), so even if the reload's `fetchItems()`
  raced the PATCH's `onSuccess` (which clears `_dirty`) and merged in a stale dirty row (per the
  offline-sync postmortem above), that row is keyed by the *same* item id as the server's copy —
  `fetchItems()`'s `byId` Map would overwrite, not duplicate. A genuine two-element match needs two
  *different* ids sharing the name "Charlie Item," and nothing in the create path (fully awaited,
  temp-id row deleted before `createItem` returns), the reorder path, or the server's `store()`/
  `update()` controllers was found to produce that.
- **Mitigated defensively anyway**: `dragRowOnto`'s helper now waits for the drop's PATCH response
  before reloading, instead of a flat `waitForTimeout(300)` — closes the specific race that *was*
  plausible (a reload landing before the mutation's response settles) even though it couldn't be
  confirmed as the actual cause.

**If this resurfaces:** the root cause is still open. Worth trying next: capture a Playwright trace
in CI specifically for this test (`--trace on`, currently not configured — see `ci.yml`'s `e2e` job,
which uploads no artifacts on failure) so the actual DOM/network state at failure time can be
inspected instead of re-guessing blind; check for SQLite lock contention between the two CI workers'
concurrent DB writes (CI runs 2 workers against one `tmp/e2e.sqlite3` file, unlike a fast local
machine) as a source of unusually long request latencies neither of the above theories accounted for.

### The committed AdonisJS/Tuyau client registry (`apps/api/.adonisjs/`) drifts — regenerate it via `pnpm dev` and commit

**Status (2026-08-26): root cause understood.** `apps/api/.adonisjs/` is generated by **three
separate generators that fire on different commands**, which is why the committed files drift from
each other and from `start/routes.ts`:

| Files | Generator | Fires on |
|---|---|---|
| `server/controllers.ts`, `server/events.ts`, `server/listeners.ts`, `client/data.d.ts`, `client/manifest.d.ts` | `indexEntities` (assembler `IndexGenerator`) | `serve --hmr` **and** `build` |
| `client/registry/*` | Tuyau `generateRegistry` (`routesScanned` hook) | **only** `serve --hmr` |
| `server/routes.d.ts` | `app_provider.ready()` `emitRoutes` | only when `!inProduction && router.commited` |

They're committed because `tsc --noEmit` (CI typecheck) resolves `#generated/controllers` and
`tests/bootstrap.ts`'s `Registry` import, and because the Docker build's `openapi_build`
(`buildFinished`) hook reads `client/registry/schema.d.ts` — which `node ace build` itself does
*not* regenerate. The historical "non-determinism" (fresh-clone regeneration producing inconsistent
results) was the consequence of running `node ace build`/`test`/plain `serve`, none of which wire up
the full codegen chain — only the `--hmr` dev server (`pnpm dev`) regenerates every file. PR #96
added `alexa.*` (and #122/#130 added `debug`, `categories.bulkImport`, `items.moveToList`,
`stores.resetCategories`) without anyone committing the corresponding `serve --hmr` output, so
`routes.d.ts` + the registry silently lagged the real routes since PR #82.

**What this means for future work:**

- **After adding/changing any route or controller, regenerate and commit `.adonisjs/`** by running
  `pnpm dev` (in `apps/api`) and confirming *both* log lines appear — `[ info ] generating indexes...`
  (`codegen: created 5 file(s)`) and `[ info ] tuyau: created api client registry` — then stop it and
  `git add apps/api/.adonisjs/`. Only the `--hmr` server produces the full set; `node ace build` /
  `list:routes` / `test` will not.
- **Regenerating will surface type errors in the Alexa tests** the first time new routes appear in
  the registry: `tests/functional/alexa.spec.ts` and `alexa_oauth.spec.ts` call
  `client.post('/api/v1/alexa').json(...)` / `.form(...)` with loosely-typed payloads, which the
  now-typed routes reject. The fix is a targeted `as any` cast at those two call sites — keep those
  casts in place, don't "improve" them back to typed payloads, since the tests deliberately send
  malformed/arbitrary envelopes. Always confirm `pnpm typecheck` is clean before committing the
  regenerated files.
- If you're touching `start/routes.ts`, don't assume the committed registry already reflects your
  change — diff `git log -1` on `apps/api/.adonisjs/server/routes.d.ts` against `start/routes.ts`
  before relying on generated types for a new route.

## Working conventions

- Full-stack features go migration → backend (model/validator/controller/policy) → shared DTO → frontend, in that order — see any `Phase 6:` commit for the pattern.
- **Run `pnpm check` before opening a PR.** It mirrors the GitHub Actions PR gate (`.github/workflows/ci.yml` → `test.yml`, plus the `e2e` job — see `foundational/PLAN.md` §12): builds `@everylist/shared`, lints and typechecks every workspace, installs Playwright Chromium, runs every workspace's coverage-gated test suite, then the web E2E suite. `pnpm check --skip-e2e` drops the E2E suite for fast iteration. This catches issues locally instead of burning (at times multiple) CI round trips. Only the CI `docker-smoke` job (production Docker image build + smoke test) isn't reproducible this way — it needs Docker. (Lighthouse's CI gate was removed in PR #30 — `scripts/lighthouse-check.mjs` still exists for manual/local runs, but nothing in CI invokes it.)
- Don't force-push, don't skip hooks, don't merge/deploy without explicit confirmation — this is a solo-maintained app with no staging environment, so anything that touches `main` effectively touches production on the next deploy.
- **Stop any dev server process you started (`pnpm dev`, `node ace serve`, `vite`/`vitest` in watch mode, etc.) once you're done with it** — including any child processes it spawned. The one exception: a dev server that was already running before you started (the user's own persistent session) — leave that alone; check process start times if unsure whether something predates your session.
