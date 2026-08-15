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
- There are no production backups configured as of this incident — data lost this way is not recoverable. Treat that as a reason to be conservative with schema changes, not just to fix the enforcement bug.

## Working conventions

- Full-stack features go migration → backend (model/validator/controller/policy) → shared DTO → frontend, in that order — see any `Phase 6:` commit for the pattern.
- Don't force-push, don't skip hooks, don't merge/deploy without explicit confirmation — this is a solo-maintained app with no staging environment, so anything that touches `main` effectively touches production on the next deploy.
