<p align="center">
  <img src="branding/icon-192.png" width="96" height="96" alt="EveryList icon">
</p>

<h1 align="center">EveryList</h1>

<p align="center">
  A narrower, sharper shopping-list PWA — the 20% of AnyList's feature set that covers 90% of real usage, done well, free, and self-hosted.
</p>

<p align="center">
  <a href="https://github.com/brianramseyau/EveryList/pkgs/container/everylist"><img alt="GHCR" src="https://img.shields.io/badge/ghcr.io-brianramseyau%2Feverylist-blue?logo=docker"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js">
</p>

---

AnyList is broad, cluttered, and paywalls basic usability. EveryList isn't chasing feature parity — it's a **mobile-first, offline-first, one-tier** PWA that does the everyday list workflow well: create, share in real time, auto-categorize by aisle, check off, and keep working with zero signal. No premium tier, ever. See [`foundational/PLAN.md`](foundational/PLAN.md) for the full product plan, architecture, and decision rationale behind everything below.

EveryList is feature-complete and self-hostable today.

## Features

- **Lists & items** — unlimited lists, quantities, notes, prices with a running budget total, soft-delete with recent-items recovery.
- **Auto-categorization** — items sort into aisle-style categories (Produce, Dairy, Meat, ...) via keyword matching, personalized over time from each list's own item history, fully customizable per list.
- **Store-aware aisle order** — pick the store you're shopping at and categories reorder to match its real layout; tag items to a store and filter the list down to just that store's items. Store data and aisle order are shared with everyone the list is shared with.
- **Favorites** — go-to items for one-tap re-adding to the list they belong to; scoped per list, since a grocery list and a packing list don't share go-to items.
- **Paste import** — paste a block of text and each line gets parsed and auto-categorized.
- **Folders & badges** — group lists into folders; an uncompleted-item count badges the installed PWA icon (Web Badging API), with per-list exclusion.
- **Real-time sharing** — SSE-based live updates across everyone on a shared list, with granular `owner`/`editor`/`viewer` roles and join-link invites.
- **Offline-first** — every core interaction works with zero network via a local IndexedDB store and syncs when back online, with last-write-wins conflict resolution.
- **Passcode lock** — a client-side PIN gate on sensitive lists; the server never sees the raw PIN.
- **Print & email export** — a print-friendly stylesheet plus one-click email export of any list.
- **Light/dark/automatic theme + accent palettes** — four accent themes on top of a real, flash-free light/dark/automatic mode.
- **Installable PWA** — add to your home screen on any device, no app store required.
- **Self-hosted, single container** — one Docker image, one process, one SQLite file under `/config`; trivial to back up.

Deliberately out of scope: native Watch apps, Siri/Alexa, home-screen widgets, and third-party fulfillment integrations (Instacart, etc.) — see the [feature decision matrix](foundational/PLAN.md#3-feature-decision-matrix) in the plan for the full reasoning.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | [SvelteKit](https://kit.svelte.dev) (Svelte 5, static adapter) + [Flowbite Svelte](https://flowbite-svelte.com) + Tailwind CSS |
| PWA | [vite-plugin-pwa](https://vite-pwa-org.netlify.app) (Workbox) + [Dexie.js](https://dexie.org) offline store |
| Backend | [AdonisJS 6](https://adonisjs.com) — Lucid ORM, VineJS validation, Transmit (SSE) |
| Database | SQLite 3 (WAL) via `better-sqlite3` — single file, no external DB service |
| Shared types | `packages/shared` — DTOs/contracts shared between API and web |
| Testing | Japa + c8 (backend), Vitest + Testing Library + Playwright (frontend) — 100% coverage policy on unit/integration |
| Deployment | Single Docker image, LinuxServer.io-style (`s6-overlay`, `PUID`/`PGID`), published to GHCR |

Full rationale for each choice is in [§4 of the plan](foundational/PLAN.md#4-technology-stack).

## Monorepo layout

```
EveryList/
├── apps/
│   ├── web/          # SvelteKit PWA
│   └── api/           # AdonisJS backend
├── packages/
│   └── shared/         # shared TS types, DTOs, validation contracts
├── docker/              # production + dev Dockerfiles, Unraid template
├── branding/             # app icon source + generated exports
└── foundational/
    └── PLAN.md            # single source of truth for scope & architecture
```

## Getting started

### Requirements

- Node.js **24+** (see `.nvmrc`)
- [pnpm](https://pnpm.io) 10.x (`corepack enable` will pick up the pinned version)

### Local development

No external services (database, cache, etc.) are required — SQLite runs off a local file.

```bash
git clone https://github.com/brianramseyau/EveryList.git
cd EveryList
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:setup

pnpm dev
```

`pnpm db:setup` creates `apps/api/tmp/db.sqlite3`, runs all migrations, and seeds the default categories — required once per fresh clone (or whenever you wipe `apps/api/tmp/`) before the API has any tables to query.

This runs both the API (`http://localhost:3333`) and the web app (`http://localhost:5173`) in parallel with hot reload.

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
pnpm db:seed            # run seeders (default categories)
pnpm db:reset           # drop all tables, re-migrate, and re-seed
```

### Local development via Docker Compose

```bash
cp apps/api/.env.example apps/api/.env
docker compose up
```

Runs the API and web app as separate containers with the repo bind-mounted for live editing.

### Running the production image

EveryList ships as a single self-contained container — one process serves both the API and the built static frontend on one port. No configuration is required to boot it:

```bash
docker run -d \
  --name everylist \
  -p 3000:3000 \
  -v /path/to/appdata:/config \
  ghcr.io/brianramseyau/everylist
```

`PUID`/`PGID` default to `99`/`100` (Unraid's `nobody`/`users`) and can be overridden; an `APP_KEY` is generated on first boot and persisted to `/config/app_key` if you don't supply one; database migrations run automatically against `/config/everylist.sqlite3` on every start, so a fresh volume and version upgrades both just work. An [Unraid Community Applications template](docker/unraid-template.xml) is included.

Available image tags:

| Tag | Meaning |
|---|---|
| `nightly` | Latest build off `main` — bleeding edge, no stability guarantee |
| `vX.Y.Z` | Exact release, never moves |
| `vX` | Latest release within major version `X` |
| `latest` | Latest stable release |

## Testing

- **Backend:** `pnpm --filter @everylist/api test` (Japa, with `c8` coverage gated at 100%)
- **Frontend:** `pnpm --filter @everylist/web test` (Vitest + Testing Library, 100% coverage gate; Playwright for E2E)

CI (GitHub Actions) runs lint → typecheck → tests/coverage → Docker build → E2E smoke on every PR; see [`.github/workflows`](.github/workflows).

Full architecture, scope decisions, and the AnyList feature-by-feature decision matrix live in [`foundational/PLAN.md`](foundational/PLAN.md).

## Contributing

This is a personal project built against [`foundational/PLAN.md`](foundational/PLAN.md) as the single source of truth — any deviation during implementation should be reflected back into that document first. Issues and PRs are welcome.

## License

[MIT](LICENSE) © Brian Ramsey
