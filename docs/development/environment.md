# Development environment

## Requirements

- Node.js **24.20.0** (see `.nvmrc`)
- [pnpm](https://pnpm.io) 10.x (`corepack enable` will pick up the pinned version)

## Local development

No external services (database, cache, etc.) are required — SQLite runs off a local file.

```bash
git clone https://github.com/brianramseyau/EveryList.git
cd EveryList
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:setup

pnpm dev
```

`pnpm db:setup` creates `apps/api/tmp/db.sqlite3`, runs all migrations, and seeds dev sample data (users, lists, stores, categories, items) — required once per fresh clone (or whenever you wipe `apps/api/tmp/`) before the API has any tables to query. The sample data is idempotent and only seeds when `NODE_ENV=development`, so it's safe to re-run any time the db gets reset. Log in with `dev@example.com` / `password` (or `partner@example.com` / `password` to see the shared-list side) — see [`apps/api/database/seeders/dev_seeder.ts`](../../apps/api/database/seeders/dev_seeder.ts) for what's included.

This runs both the API (`http://localhost:3334`) and the web app (`http://localhost:5174`) in parallel with hot reload. Before starting, a pre-flight check (`scripts/dev-preflight.mjs`) verifies both ports are free and aborts with the offending process(es) if something else — e.g. a stale dev server from another project — is already listening.

Other useful scripts, runnable from the repo root across every workspace:

```bash
pnpm build         # build all apps
pnpm lint          # ESLint across the monorepo
pnpm typecheck     # tsc --noEmit in every workspace
pnpm test          # Japa (api) + Vitest (web)
pnpm format        # Prettier write

pnpm db:migrate         # run pending migrations
pnpm db:migrate:status  # show migration status
pnpm db:migrate:rollback# roll back the last migration batch
pnpm db:seed            # run seeders (dev sample data)
pnpm db:reset           # drop all tables, re-migrate, and re-seed
```

## Local development via Docker Compose

```bash
cp apps/api/.env.example apps/api/.env
docker compose up
```

Runs the API and web app as separate containers with the repo bind-mounted for live editing.
