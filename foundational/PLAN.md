# EveryList — Foundational Plan

Status: **All planned phases complete (§14).** Phase 0 (Foundations), Phase 1 (Auth & domain core), and Phase 2 (List & item CRUD) complete, including component tests, 100% coverage gates on both `apps/api` and `apps/web`, a truly virtualized `@mdi/js` icon picker (categories), and a manual end-to-end smoke pass against a live API. Phase 3 (UI/UX Redesign & Theming Foundations) complete — see §16 and the status note. Phase 4 (Sharing & real-time) complete — see the status note. Phase 5 (Offline & PWA) complete — see the status note; this was the MVP-complete milestone. Phase 6 (item-store tagging, prices, folders, badge counts, export) complete — see the status note. Phase 7 (Polish — passcode lock, extra accent themes, personalized categorization, performance/accessibility hardening) complete — see the status note, including one honestly-documented open gap: Lighthouse Performance is a real 72 against a production build, short of §13's 90 target, with the root cause identified (flowbite-svelte's JS bundle not tree-shaking to the 8 components this app actually uses) and a regression-guard threshold in place rather than a false pass.
This document is the single source of truth for scope, architecture, and process until superseded by an updated version. Any deviation from it during implementation should come back here as an edit first.

---

## 1. Vision & Product Philosophy

AnyList is broad, cluttered, and monetizes with a hard paywall over basic usability. EveryList's goal is **not** feature parity — it's a **narrower, sharper tool** that does the 20% of AnyList's feature set that accounts for 90% of real usage, done well, free of upsell friction, and installable as a PWA on any device without an app store.

Guiding principles:
- **Mobile-first, offline-first.** The primary use case is standing in a store with flaky signal. Every core interaction (add item, check item, edit quantity) must work with zero network and sync later.
- **Narrow beats complete.** We deliberately cut features that require native platform hooks (Watch app, Siri/Alexa, home-screen widgets) or third-party commercial integrations (Instacart/Walmart fulfillment) that don't fit a lean, self-hosted PWA.
- **One tier.** No premium paywall. Features that AnyList locks behind "Complete" are included or excluded based on engineering value, not monetization — see the decision matrix below.
- **Boring, well-tested technology.** TypeScript everywhere, one frontend framework, one backend framework, no speculative abstraction.

---

## 2. Scope Strategy: What "Narrowed" Means

Full feature parity with AnyList (including Watch app, Siri, Alexa, Instacart fulfillment, native widgets) is out of reach for a PWA and out of scope for what this app is trying to be. Instead:

- **MVP (Phase 1–5 below):** the core list-management loop — create, share, categorize, check off, favorite, recover, import, use fully offline, and do all of that in a UI that doesn't feel like a developer scaffold (Phase 3, see §16).
- **Phase 6+ (stretch):** high-value AnyList "Complete" features that are pure software (stores/filtering, prices/budget, folders, extra premium themes, passcode) and don't require a native shell.
- **Explicitly out of scope:** anything requiring native OS integration a PWA cannot provide (Siri/Alexa voice, Apple Watch, home-screen widgets, geofencing) or third-party commercial fulfillment APIs (Instacart, Walmart, Kroger, etc.). These are flagged below with rationale, not silently dropped, so the decision is visible and revisitable.

---

## 3. Feature Decision Matrix

| AnyList Feature | Tier | Decision | Rationale |
|---|---|---|---|
| Unlimited lists | Free | **MVP** | Core. |
| Real-time sharing | Free | **MVP** | Core differentiator; SSE-based live updates. |
| Smart autocomplete & auto-categorization | Free | **MVP** (basic) | Seeded category keyword matching, shared between API and client (see §9) so it still works offline. ML-personalized suggestions deferred to Phase 7 — at that point the matcher stops being a static table both sides can trivially share, and categorization needs to become an actual backend service the offline client calls/caches against rather than a shared constant, with a plan for what an offline client does when it can't reach that service. |
| Category customization (reorder/rename/create/icon) | Free | **MVP** | Needed for auto-categorization to be trustworthy. Ordering is scoped **per store** (see below), with a per-list default order as the fallback when no store is selected. Icon choice is the *full* Material Design Icons set (~7,000+ glyphs via `@mdi/js`), not AnyList's short fixed list — see §4/§7. |
| Store selection & per-store aisle order *(new — not a literal AnyList feature)* | Free | **MVP** *(pulled forward from Phase 6)* | Pick the store you're shopping at; categories reorder to match that store's real aisle layout. The `Store` entity and its category-order data are shared with everyone the associated list(s) are shared with — see §7. This is the piece of AnyList's "Stores & Store Filtering" premium feature that matters most day-to-day; item-tagging/filtering (below) stays deferred. |
| Favorites (per-list) | Free | **MVP** | Core loop for repeat shopping. Scoped to a single list rather than a global master list — a grocery list, a camping packing list, and a Christmas gift list have unrelated go-to items, so one global favorites pool made little sense. |
| Recent items (restore checked/deleted) | Free | **MVP** | Cheap with soft-delete, high value. |
| Quantities & notes | Free | **MVP** | Core item fields. |
| Copy & paste import | Free | **MVP** | Simple parser, high leverage. |
| Print & email export | Free | **MVP** (print only, email deferred) | Browser print stylesheet is trivial; outbound email (SMTP2GO, see §15) ships in Phase 6. |
| Uncompleted item badge count | Free | **Phase 6** | Web Badging API, partial browser support; app-shell first. |
| Home screen install (PWA) | Free (native widget) | **MVP** (install/manifest), widgets **out of scope** | PWA installability ≠ native home-screen widgets; widgets need a native shell (Capacitor), not planned. |
| Voice Assistant (Siri/Alexa) | Free | **Out of scope** | Requires native intents/skills; not achievable from a PWA. Revisit only if a Capacitor wrapper is built later. |
| Online grocery fulfillment (Instacart, etc.) | Free | **Out of scope** | Requires commercial partner API agreements; not a lean-engineering decision. |
| Stores & store filtering | Premium | **Phase 6** *(narrowed)* | The `Store` entity itself ships in MVP (see above); Phase 6 adds tagging individual items with a store and filtering the list view to only that store's items. |
| Prices & budget tracking | Premium | **Phase 6** | Adds price field + running total; depends on Stores. |
| Apple Watch app | Premium | **Out of scope** | Native-only platform. |
| List folders | Premium | **Phase 6** | Straightforward grouping entity. |
| Location-based reminders | Premium | **Out of scope (for now)** | Web Geofencing isn't reliably available; approximating with plain Geolocation + push is fragile. Revisit if PWA background geolocation matures. |
| Passcode lock | Premium | **Phase 7** | Client-side PIN gate (WebAuthn or local PIN) on sensitive lists. |
| Light/dark/automatic theme | Free | **Phase 3** *(pulled forward)* | AnyList locks this behind "Complete"; EveryList ships it free and early — see §16. A real, user-facing toggle with no FOUC, not just an unstyled `prefers-color-scheme` fallback. |
| Extra premium themes | Premium | **Phase 7** | Flowbite theming makes additional accent palettes cheap once the light/dark foundation (Phase 3, §16) exists. |
| Desktop & web access | Premium | **Already satisfied** | The product *is* the web app — no separate native client needed. |
| Badge exclusion | Premium | **Phase 6** | Ships alongside badge counts. |
| App version & build info visible in-app *(new — not from AnyList's list)* | Free | **MVP** | Self-hosted admins running a moving tag (`nightly` or a major-pin `vX`) need an easy way to confirm exactly what build is actually running. Shown at the bottom of the Settings page — see §8/§12. |

---

## 4. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node.js 24 (LTS)** | Enforced via `engines` + `.nvmrc` + CI matrix. |
| Language | **TypeScript** (strict mode) everywhere | `strict: true`, `noUncheckedIndexedAccess: true`, shared `tsconfig.base.json`. |
| Frontend framework | **SvelteKit** (Svelte 5), built with `adapter-static` | File-based routing during development; production build is fully static (no SvelteKit SSR server) and is served directly by AdonisJS — keeps the deployed container to one process. |
| UI kit | **Flowbite Svelte** (+ Tailwind CSS) | Accessible components, light/dark theming out of the box. |
| PWA tooling | **vite-plugin-pwa** (Workbox) | Manifest, service worker, precache + runtime caching strategies. |
| Offline store | **Dexie.js** (IndexedDB wrapper) | Local-first source of truth; sync queue built on top. |
| Category icons | **`@mdi/js`** (Pictogrammers Material Design Icons, ~7,000+ glyphs) | Full icon set for category selection — see §7. Path data only (no icon font); rendered as inline `<svg>` in a Svelte `Icon` component. Loaded as its own lazy chunk (dynamic `import()`), not part of the initial app-shell bundle, so it doesn't hurt first-load Lighthouse scores; precached by the service worker after first load so the icon picker still works offline. The picker UI is a virtualized, searchable grid (search by name/tag from the package's `meta.json`) — never renders all ~7,000 SVGs to the DOM at once. |
| Backend framework | **AdonisJS 6** | Native TypeScript, Lucid ORM, VineJS validation, built-in Auth, Transmit (SSE) for real-time. |
| Database | **SQLite 3 (WAL mode)** via `better-sqlite3` + Lucid | Single-file DB living under the container's `/config` volume; trivial Unraid appdata backups; sufficient for the household/small-shared-list concurrency this app targets — no separate DB service to run. |
| Rate limiting store | **In-memory** (Adonis Limiter memory store) | No Redis or other external service — this app targets a single self-hosted instance (Unraid), not horizontal scaling, so an in-process store is the right level of complexity. |
| Outbound email | **SMTP2GO** (via Adonis `mail` SMTP transport) | Invite emails (Phase 4) and list export emails (Phase 6); credentials via env vars, not committed. |
| Real-time transport | **Adonis Transmit (SSE)**, local (in-process) transport | Simpler than WebSockets for one-directional server→client push; sufficient for list sync events; local transport matches the single-instance deployment. |
| Validation | **VineJS** (backend), shared Zod-free — DTOs generated from VineJS schemas shared via `packages/shared` | Single source of truth for request/response shapes. |
| Backend testing | **Japa** (Adonis's native runner) + **c8** for coverage | |
| Frontend testing | **Vitest** + **@testing-library/svelte** (unit/integration), **Playwright** (E2E) | |
| Package management | **pnpm** workspaces | Monorepo, single lockfile. |
| CI | **GitHub Actions** | Lint → typecheck → test+coverage gate → build → E2E smoke. |

---

## 5. System Architecture

```
                     ┌─────────────────────────────────────┐
                     │   Browser / Installed PWA              │
                     │  SvelteKit (static build) + Flowbite   │
                     │  Service Worker (Workbox)               │
                     │  IndexedDB (Dexie) local store           │
                     │  = source of truth on-device              │
                     └────────────────┬─────────────────────────┘
                                       │ HTTPS (REST) + SSE (live updates)
                                       ▼
        ┌────────────────────────────────────────────────────────────┐
        │  Docker container — Unraid, LinuxServer.io-style base image  │
        │  s6-overlay init: reads PUID/PGID, usermod/groupmod the app   │
        │  user, chowns /config, drops root, then execs one process:    │
        │                                                                │
        │   AdonisJS (Node 24) — serves /api/v1/* (Lucid + VineJS +     │
        │   Transmit) AND serves the prebuilt SvelteKit static assets    │
        │   for everything else, on a single exposed HTTP port.          │
        └───────────────────────────────┬──────────────────────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │   /config (volume)     │
                              │  everylist.sqlite3      │  ← WAL mode
                              └──────────────────────────┘
```

**Deployment shape:** a single Docker image, built on an s6-overlay base image (mirroring LinuxServer.io's own pattern), so `PUID`/`PGID` environment variables control filesystem ownership exactly the way LSIO images do — the init stage remaps the container's app user to the supplied IDs and `chown`s `/config` before dropping privileges and starting the app. Inside the container there is exactly **one Node process**: AdonisJS serves both the REST/SSE API and the static SvelteKit build, so the container exposes exactly one HTTP port and needs no internal reverse proxy. All persistent state — the SQLite database file — lives under a single `/config` volume, which also makes Unraid appdata-backup plugins trivial to use for backups. This is a single-instance deployment target by design; no clustering/multi-node concerns apply (see the in-memory rate-limit store and Transmit local transport in §4).

**Standing rule — zero-config startup:** every environment variable the Dockerfile can sensibly default, it must default, directly via `ENV` instructions in `docker/Dockerfile` — not left to be supplied by the Unraid template or a `docker-compose.yml`, which are just one of several ways the image can be run. `HOST` (`0.0.0.0`), `PORT` (`3000`), and `NODE_ENV` (`production`) are baked in this way, as are `PUID`/`PGID` (`99`/`100`, the standard LSIO "nobody"/"users" defaults — see §5's `PUID`/`PGID` remap above), so `docker run ghcr.io/brianramseyau/everylist` with no `-e` flags at all and only a `/config` mount is a valid, working invocation. The corollary: **no environment variable that cannot be safely defaulted is allowed to prevent the container from starting.** The one such variable in this plan is `APP_KEY` (AdonisJS's encryption/signing key) — it can't ship with a shared baked-in default without breaking every deployment's security, but requiring the user to generate and paste one before first boot violates this rule. Instead, the s6-overlay init stage checks for `APP_KEY`: if unset, it looks for a previously-generated key persisted at `/config/app_key`; if that doesn't exist either, it generates one (`node ace generate:key`), persists it to `/config/app_key`, and exports it into the app's environment for that boot and every boot after. An explicitly-set `APP_KEY` env var always takes precedence over the persisted file. Net effect: the container always starts, with or without any configuration, and `docker/unraid-template.xml`'s `APP_KEY` field is convenience/override, not a hard requirement. The same rule covers the schema itself: a further `cont-init.d` step (`30-migrate`, run after `20-app-key` since ace needs `APP_KEY` to boot, before the app process starts) runs `node ace migration:run --force` against `/config/everylist.sqlite3` on every boot, so a brand-new `/config` volume gets its schema created automatically and an upgraded image applies any new migrations — no manual `node ace migration:run` step required on first run or on update.

**Why SSE over WebSockets:** all real-time traffic in this app is server→client (list/item changed elsewhere). Client→server mutations go over normal REST calls that also drive the offline sync queue. SSE is simpler to scale, reconnect, and load-balance than WebSockets, and Transmit ships with Adonis natively.

---

## 6. Monorepo Layout

```
EveryList/
├── foundational/
│   └── PLAN.md
├── branding/
│   ├── icon.svg                   # app icon source (see §9)
│   └── icon-{512,192,96,48,32,16}.png   # generated previews/exports
├── apps/
│   ├── web/                     # SvelteKit PWA
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── lib/
│   │   │   │   ├── components/
│   │   │   │   ├── stores/      # Svelte stores (app state)
│   │   │   │   ├── offline/     # Dexie schema + sync queue
│   │   │   │   ├── api/         # typed API client (uses packages/shared DTOs)
│   │   │   │   └── pwa/         # manifest, SW registration helpers
│   │   │   └── app.html
│   │   ├── static/
│   │   ├── tests/                # Vitest unit/integration
│   │   ├── e2e/                  # Playwright
│   │   └── vite.config.ts
│   └── api/                      # AdonisJS backend
│       ├── app/
│       │   ├── controllers/
│       │   ├── models/           # Lucid models
│       │   ├── validators/       # VineJS schemas
│       │   ├── services/
│       │   └── events/           # Transmit broadcasters
│       ├── database/
│       │   ├── migrations/
│       │   └── seeders/          # default categories, demo data
│       ├── start/
│       └── tests/
│           ├── unit/
│           └── functional/
├── packages/
│   └── shared/                   # shared TS types, DTOs, validation contracts
├── docker/
│   ├── Dockerfile                 # LSIO-style single image (s6-overlay, PUID/PGID)
│   ├── root/                      # s6-overlay init scripts copied into the image
│   │   └── etc/{cont-init.d,services.d}/...
│   └── unraid-template.xml        # Community Applications template
├── .github/workflows/
│   └── docker-publish.yml         # nightly (main) + semver/major/latest (tags) -> GHCR, see §12
├── docker-compose.yml            # local dev: api + web with hot reload (no external services needed)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

---

## 7. Domain Model

Core entities (fields abbreviated to the decision-relevant ones):

- **User** — id, email, passwordHash, name, createdAt.
- **List** — id, name, color/icon, ownerId, folderId (nullable, Phase 6), archived, badgeExcluded (Phase 6), passcodeHash (nullable, Phase 7), timestamps + `deletedAt`.
- **ListMember** — listId, userId, role (`owner` \| `editor` \| `viewer`), invitedAt, acceptedAt. Backs real-time sharing.
- **Category** — id, name, icon, sortOrder, listId (nullable = global default), isDefault. Seeded with standard aisle categories (Produce, Dairy, Meat, Bakery, Frozen, Pantry, Household, Other); per-list overrides for reorder/rename/custom categories; `sortOrder` here is the **fallback** order used whenever no store is selected (see `StoreCategoryOrder` below). `icon` stores an `@mdi/js` icon **name** (e.g. `"fruitCherries"`), not an SVG blob — the client resolves the name to path data at render time. `@mdi/js` is version-pinned (not auto-updated) so stored names don't silently break; the `Icon` component falls back to a generic "list item" glyph if a name ever fails to resolve, rather than rendering nothing.
- **Item** — id, listId, name, quantity, notes, categoryId, checked, checkedAt, sortOrder, storeId (nullable, Phase 6 — item-to-store tagging), price (nullable, Phase 6), createdBy, timestamps + `deletedAt` (backs Recent Items recovery).
- **FavoriteItem** — id, userId, listId, name, defaultCategoryId, defaultQuantity, unique on `(listId, name)`. Scoped to a single list (a "Groceries" favorite and a "Camping" favorite are independent, even with the same name) — one-tap rebuild for that list only, not a global master list.
- **Store** *(MVP)* — id, name, color, createdBy (audit only, not an access-control owner). Not owned by a single user or a single list — see `ListStore` below for how visibility works.
- **ListStore** *(MVP)* — listId, storeId. Join table attaching a `Store` to one or more `List`s. A store becomes visible/selectable to everyone who is already a `ListMember` of any list it's attached to — this is how "shared via list membership" is implemented without inventing a second sharing/permission primitive; `editor`+ can rename the store or reorder its categories, `viewer` can select it and see the resulting order. Attaching an existing store to a second list (e.g. "Walmart" used for both a Groceries list and a Hardware list) just adds a row here — no duplication, and it becomes visible to that list's members too.
- **StoreCategoryOrder** *(MVP)* — storeId, categoryId, sortOrder. The per-store override of category order, edited via a "reorder categories for this store" screen. When rendering a list with a store selected, the app looks up `(store, category)` here for each category the list uses and falls back to that list's own `Category.sortOrder` for any category not yet customized for that store.
- **Folder** (Phase 6) — id, userId, name, color, sortOrder.
- **SyncEvent** — id, entityType, entityId, op (`create`/`update`/`delete`), version, updatedAt. Backs both the offline conflict check (client sends `lastKnownVersion`) and the Transmit broadcast payload.

**"Currently shopping at" is a local, per-device selection, not shared state:** the store you have selected while viewing a list is kept in the client (IndexedDB/localStorage), not written to the `List` row or broadcast over Transmit. Two household members shopping at different physical stores at the same time should each see categories ordered for *their* store, not have that flip out from under them because a co-shopper switched stores on a shared list. What *is* shared in real time is the underlying `Store` and `StoreCategoryOrder` data — so if one person edits "Walmart"'s aisle order, every household member's next visit to that store shows the update.

**Conflict resolution:** last-write-wins per item, keyed on a monotonically increasing `version` column bumped server-side on every mutation. The client's offline queue attaches the last version it saw; the server accepts if the version matches or is newer than what it has recorded as synced from that client, otherwise flags a conflict the client resolves by taking the server's copy and re-applying the local diff as a new edit (no silent data loss, no CRDT complexity for v1).

---

## 8. API & Real-Time Design

- REST, versioned under `/api/v1/...`, resource-oriented (`/lists`, `/lists/:id/items`, `/lists/:id/members`, `/lists/:id/favorites`, `/categories`, `/lists/:id/stores`, `/stores/:id/categories`).
- All request/response bodies validated with VineJS; the inferred types are re-exported from `packages/shared` so the SvelteKit client is fully typed against the same contracts the backend enforces.
- Real-time: clients subscribe to `list/:id` Transmit channels on list open; every mutation broadcasts a `SyncEvent` to that channel so other connected members see updates within roughly a second, with an optional "list was modified" toast per the AnyList "modification alerts" behavior. `Store` and `StoreCategoryOrder` changes broadcast on the same channel for every list the store is attached to, so a household member's aisle-order edit shows up live for co-shoppers.
- Bulk import endpoint (`POST /lists/:id/items/import`) accepts raw pasted text, splits lines, and runs each line through the same auto-categorization pass as manual add.
- Store endpoints: `GET/POST /lists/:id/stores` (list/attach-or-create stores visible to this list), `PATCH /stores/:id/categories` (reorder — replaces that store's `StoreCategoryOrder` rows), permission-checked against the requester's `ListMember` role on any list the store is attached to.
- `GET /api/v1/meta` — unauthenticated, returns `{ version, commit, builtAt }` describing the *image*, not the request: `version` is `nightly` for a main-branch build or the exact tag (`v1.2.3`) for a release build, `commit` is the short git SHA, `builtAt` is the build timestamp. These are baked into the image at `docker build` time as `ARG`/`ENV` (`APP_VERSION`, `GIT_SHA`, `BUILD_DATE` — set by `.github/workflows/docker-publish.yml`, see §12), not computed at container startup, since they describe the image, not the running instance. The Settings page footer (§9) is this endpoint's only consumer.

---

## 9. Offline-First & PWA Strategy

- **Local-first writes:** all mutations write to Dexie (IndexedDB) immediately and render optimistically; a background sync queue drains to the API when online.
- **"Currently shopping at" store selection** is purely local/per-device (see §7) — stored in Dexie alongside the offline data, works fully offline, and is never part of the sync queue since it's never sent to the server.
- **Service worker (Workbox via vite-plugin-pwa):** precache the app shell; runtime-cache GET requests with stale-while-revalidate; offline fallback route for full navigations. The lazy-loaded `@mdi/js` icon-picker chunk (§4) is explicitly added to the precache list — once a user has opened the icon picker once, it (and category icon editing generally) keeps working offline.
- **Sync queue:** durable queue table in Dexie of pending mutations, retried with backoff, flushed on `online` events and periodically via the Background Sync API where supported, with a manual "retry sync" affordance as a fallback for browsers without it.
- **Auto-categorization must move client-side for this phase.** Today the keyword lookup (`apps/api/app/services/auto_categorize_service.ts`) only runs server-side on item create, which is fine for an online-only client but breaks the optimistic-write model above: an item added offline has to render *something* immediately, before any round trip. Plan is to lift `KEYWORDS_BY_CATEGORY`/`suggestCategoryName` into `packages/shared` so both the API and the Dexie-side optimistic insert import the same table and agree on the guess without a network call. This is only viable while the matcher stays a static keyword table — see §3's auto-categorization row for the Phase 7 caveat once ML replaces it.
- **Installability:** web app manifest with icons/splash screens, `display: standalone`, theme color; install prompt surfaced contextually, not nagged. App icon source lives at `branding/icon.svg` (PNG exports alongside it) — a cheeky, deliberately distinct riff on AnyList's dated, thin/wispy iOS-7-era checklist icon: a bold cyan-to-blue gradient squircle, a tilted clipboard with every row already checked off (the "every" vs. "any" pun), and an oversized two-tone checkmark stamp sweeping past the card's edge. Manifest icons (192/512, maskable variant) and favicon sizes are generated from this SVG during Phase 0/5 rather than hand-drawn per size.
- **Badge counts (Phase 6):** Web Badging API where available; degrades gracefully (in-app count only) where not.
- **Settings page, version footer:** a plain-text row at the bottom of Settings — e.g. `EveryList v1.4.2 (a1b2c3d) · built Aug 12, 2026` or `EveryList nightly (a1b2c3d) · built Aug 12, 2026` — fetched from `GET /api/v1/meta` (§8) like any other GET request, so it rides the same stale-while-revalidate runtime cache: still shows the last-known build info offline, refreshes silently once back online. No special-casing needed beyond the endpoint existing.

---

## 10. Auth & Sharing Model

- Adonis Auth **access token guard** (opaque bearer tokens, hashed at rest), short-lived access token + rotating refresh token, since the SPA and API may not share a domain.
- Sharing: list owner invites by email (creates a pending `ListMember`) or generates a shareable join link/code; accepting requires an account (keeps ownership/audit trail meaningful, avoids anonymous-edit chaos).
- Roles: `owner` (manage members, delete list), `editor` (add/edit/check items), `viewer` (read-only) — AnyList itself doesn't have granular roles, this is a deliberate improvement.

---

## 11. Testing Strategy & 100% Coverage Policy

100% is a **policy**, not a slogan — it only stays true if the codebase is written to make it achievable:

- Dependency-inject external effects (email, storage, clock, random IDs) behind interfaces so every branch is reachable in tests without real I/O.
- No dead code, no speculative branches ("just in case" error handling for states that can't occur) — this project's own "don't add unreachable error handling" rule doubles as a coverage-enablement rule.
- Any explicitly-excluded line (e.g. a `/* c8 ignore */` on a truly untestable line such as a top-level bootstrap `main()`) must carry a one-line comment justifying the exclusion, and exclusions are reviewed in PR.

**Backend (`apps/api`):**
- Unit tests (Japa) for services, validators, sync/version-conflict logic.
- Functional tests (Japa `ApiClient`) hit real HTTP routes against a disposable in-memory/temp-file SQLite DB, migrated fresh and wrapped in a transaction per test and rolled back.
- Coverage via `c8` wrapping `node ace test`; `.c8rc.json` sets `lines`, `branches`, `functions`, `statements` thresholds to 100 and `check-coverage: true`, run in CI as a hard gate.

**Frontend (`apps/web`):**
- Component/unit tests: Vitest + Testing Library (`jsdom`), covering every component, store, and utility, including the offline sync queue logic (using `fake-indexeddb` to simulate Dexie without a real browser).
- Coverage via Vitest's built-in `v8` provider with `coverage.thresholds` set to 100% across all four metrics, gated in CI.
- **E2E (Playwright):** critical journeys — create/share a list, add/check/import items, go offline → add items → reconnect → confirm sync, install prompt flow, accessibility smoke via `axe-core`. E2E runs against a real Dockerized backend and **is a required merge gate but is not folded into the 100% coverage number** — coverage measures unit/integration only; E2E measures user-facing correctness. This distinction is stated explicitly so "100% coverage" isn't overclaimed as "0 bugs."

---

## 12. CI/CD & Quality Gates

GitHub Actions pipeline (per PR):
1. Install (pnpm, cached) → lint (ESLint + Prettier check) → typecheck (`tsc --noEmit` in every workspace).
2. `apps/api` tests + coverage gate (SQLite is file/in-memory, so no external service containers are needed).
3. `apps/web` tests + coverage gate.
4. Build both apps and the production Docker image (`docker/Dockerfile`).
5. Playwright E2E smoke against the built container.
6. Merge blocked on any failing step, including coverage falling under 100%.

**Docker publishing** (`.github/workflows/docker-publish.yml`, implemented) targets GHCR (`ghcr.io/brianramseyau/everylist`) and re-runs the same lint/typecheck/coverage-gated test suite as a hard prerequisite (`needs: test`) before ever pushing an image — a tag pushed against an old, broken commit can't slip a bad image out. Two triggers, two tagging behaviors:

| Trigger | Tags produced | Intent |
|---|---|---|
| Push to `main` | `nightly` | A moving tag tracking the tip of `main` — for people who want the bleeding edge, not a stability guarantee. |
| Push of a semver tag `vX.Y.Z` | `vX.Y.Z` (exact, never moves again) + `vX` (major, moves to the newest `vX.y.z` release) + `latest` (moves to the newest **stable** release) | Lets anyone pin however tight they want: `vX.Y.Z` for a fully pinned/reproducible deploy, `vX` for "stable, auto-patched within this major," or `latest` for "just the newest stable." A prerelease tag like `v1.2.3-beta.1` still gets its own exact tag but deliberately does **not** move `vX` or `latest`, so a prerelease can never leak into someone pinned to a major version. |

Tag computation uses `docker/metadata-action`, which derives all of this from a single pushed git tag — there's no separate manual step to compute or push the major/latest tags.

---

## 13. Non-Functional Requirements

- **Performance:** Lighthouse PWA/Performance/Accessibility/Best-Practices scores ≥ 90 on the list-view route, checked in CI on the built app.
- **Accessibility:** WCAG 2.1 AA target; Flowbite's components are a starting point, not a guarantee — verified with `axe-core` in both component tests and E2E.
- **Security:** VineJS validation at every boundary, Adonis rate limiter on auth and mutation endpoints, hashed tokens/passwords, dependency audit in CI (`pnpm audit` or equivalent), CSRF protection if any cookie-based flows are introduced.
- **Data ownership:** soft-delete (`deletedAt`) everywhere user-visible "recent/deleted" recovery depends on it; hard-delete only via an explicit purge job after a retention window (TBD, default 30 days).
- **i18n:** not implemented in v1, but strings are kept out of component markup where cheap to do so, to avoid a costly later migration.

---

## 14. Roadmap / Delivery Phases

| Phase | Contents |
|---|---|
| **0 — Foundations** | This plan; repo scaffold (pnpm workspaces, local dev Docker Compose, CI skeleton, lint/format/typecheck config, shared `tsconfig`); empty Adonis + SvelteKit apps wired together; `docker/Dockerfile` (LSIO-style, PUID/PGID) and `docker/unraid-template.xml` producing a runnable single-container image from day one; `.github/workflows/docker-publish.yml` (already written, §12) goes green as soon as the pnpm scripts it calls (`lint`/`typecheck`/`test`) and `docker/Dockerfile` exist. |
| **1 — Auth & domain core** | User auth (register/login/refresh), `List`/`Category`/`Item` migrations + models, default category seeding; minimal Settings page shell with the `GET /api/v1/meta` version/build-info footer (§8/§9) — cheap to ship early and useful as a deployment sanity check from the first runnable build onward. |
| **2 — List & item CRUD** | Full list/item management UI + API, quantities/notes, auto-categorization, category customization, favorites, recent-items recovery, `Store`/`ListStore`/`StoreCategoryOrder` + the store selector and "reorder categories for this store" screen. |
| **3 — UI/UX Redesign & Theming Foundations** | Design-system footings for everything built so far — see §16 for the full brief. Persistent app shell (header + bottom navigation) replacing the ad hoc per-page headers from Phase 1/2; a real light/dark/automatic theme system with a user-facing Settings toggle, no flash-of-unstyled-theme, and app-wide background/text tokens (not just scattered `dark:` text-color utilities); grouped-row visual language for Settings and list rows modeled on AnyList's information density and navigation patterns (not its exact styling); wiring the `@mdi/js` icon set (§4/§7) into real icon pickers for lists/categories/stores in place of the plain text inputs Phase 2 shipped with; colored/iconed category section headers on the list-detail screen. This phase intentionally does no new domain/API work — it is a UI-only pass over Phase 1–2's surface area before Phase 4 adds more screens on top of it. |
| **4 — Sharing & real-time** | `ListMember` roles, invite/join flow, Transmit channels, live update UI + modification toasts (also covers live updates to shared `Store`/`StoreCategoryOrder` edits from §7/§8). |
| **5 — Offline & PWA** | Dexie local store (including the local-only store-selection state from §9), sync queue + conflict resolution, service worker, manifest/installability, offline E2E coverage. This phase is the MVP-complete milestone. |
| **6 — Item-store tagging, prices, folders, export** | Item-to-store tagging + filtered "show only this store's items" view (on top of the `Store` entity from Phase 2), price/budget tracking, list folders, badge counts/exclusion, email export. |
| **7 — Polish** | Passcode lock, extra premium-equivalent themes on top of the Phase 3 light/dark foundation, personalized autocomplete, performance/accessibility hardening pass. |

No calendar dates are set here since team size/velocity aren't yet known — phases are ordered by dependency, not duration.

---

## 15. Assumptions & Open Questions

**Resolved:**
1. **Hosting target** — Docker on Unraid, packaged in a LinuxServer.io-style single-container image with `PUID`/`PGID` support (see §5 and `docker/unraid-template.xml`).
2. **Frontend build** — SvelteKit with `adapter-static`, served by AdonisJS from the same process/container.
3. **Auth method** — email+password only for v1. No OAuth/social login in MVP; nothing in the `User` schema needs to reserve space for it since adding a provider later is an additive migration.
4. **Monetization** — no premium tier, ever. Every feature in the §3 decision matrix is either shipped free or deferred/out-of-scope on engineering merit, not gated. `User`/`List` schemas carry no tier/plan field, now or later.
5. **Email delivery provider** — **SMTP2GO**, for both Phase 6 email export and Phase 4 invite-by-email. Adonis's `mail` config will use the SMTP transport pointed at SMTP2GO; API key/credentials supplied via environment variables (`SMTP2GO_*`) at deploy time, not committed.
6. **Container registry** — GHCR (`ghcr.io/brianramseyau/everylist`), per `docker/unraid-template.xml`'s `Repository` field.

No open questions remain blocking Phase 0.

---

## 16. UI/UX Design System & Theming (Phase 3)

**Why this phase exists:** Phase 1 and 2 shipped functionally-complete screens styled with whatever default Flowbite/Tailwind spacing fell out of the fastest correct implementation — plain `<input>` rows, ad hoc per-page `← Back` links instead of real navigation, category names as bare text with no icon or color, and `dark:` utility classes sprinkled onto text without a corresponding dark background anywhere, so the app never actually looked coherent in either theme. EveryList is explicitly *not* trying to clone AnyList's visual skin (own icon, own palette, own name pun — see §9's icon description) but it should take the same **structural** UX lessons AnyList gets right, because there's no engineering reason not to:

- A **persistent app shell** — a header plus bottom navigation — instead of every screen inventing its own back-link and inline text links.
- **List rows as small cards with an icon/color identity**, a one-line meta row (item count, shared-with), not a bare `<a>` with a text label.
- **Category section headers with an icon and a color**, not just a small gray caption.
- **Grouped, tap-target-sized settings rows** organized into labeled sections, not a single unstructured paragraph.
- A real, user-controlled **light/dark/automatic theme**, applied consistently everywhere, not a partial `prefers-color-scheme` fallback with no override and no matching backgrounds.

**Scope boundaries:** this phase touches presentation only. No new API endpoints, no schema changes, no new domain behavior — everything it styles already works per Phase 2's functional-complete status. Anything that *would* need new backend work (e.g., a real per-list color/icon field, if the existing `List.color/icon` columns from §7 aren't sufficient) stays in scope for Phase 3 to build against, since those columns are already part of the Phase 1 schema; anything bigger than that is out of scope and pushed to the phase that actually owns the feature.

**Deliverables:**
1. **Theme system** (done — see the Phase 3 status note): `light` / `dark` / `automatic` preference, persisted, applied via a class on `<html>` (Tailwind v4 `@custom-variant dark`) rather than the bare media-query default, no flash of the wrong theme on first paint, one Settings control to change it, and app-wide background/text tokens so the theme is consistent on every route rather than page-by-page.
2. **App shell** (done): persistent bottom navigation across the authenticated Lists/Favorites/Settings sections, plus a shared `PageHeader.svelte` (title + optional back-link + contextual actions snippet) replacing the one-off `<h1>` + inline links every page previously rolled itself.
3. **List index redesign** (done): each list is a card-style row with an icon/color swatch (backed by `List.color`/`List.icon`, already in the §7 schema — Phase 2 just never surfaced them in the UI) and an item-count meta line, backed by a new `ListDto.itemCount` field (count of undeleted, unchecked items — computed server-side via Lucid's `withCount`, no schema change).
4. **Category headers redesign** (done): section headers on the list-detail screen gain the category's icon plus an accent color. Correction to this deliverable's original wording — `Category` has no `color` column (§7 was never amended to add one, and adding one is out of this UI-only phase's scope), so the accent color is the parent `List.color` applied to every category header in that list, not a per-category color.
5. **Icon/color pickers** (done): category create/rename already had the searchable `@mdi/js` picker (`Icon.svelte`/`IconPicker.svelte`) from Phase 2's late polish pass. This phase added `ColorPicker.svelte` (a fixed 18-color swatch grid, same popover pattern as `IconPicker`) and wired both into the list-create form (`List.color`/`List.icon`) and the store-create form. Correction to this deliverable's original wording — `Store` has no `icon` column (only `color`), so the store form got a color picker, not an icon picker.
6. **Settings restructure** (done): the single paragraph is now three labeled sections — Account (moved "Log out" here, alongside its existing spot on the Lists page), Appearance (the theme control from this phase's first slice), and About (the `/api/v1/meta` build-info footer, now inside its own section instead of a loose `<footer>`).

None of this phase's work is a hard dependency for Phase 4 (Sharing) to start — the two can proceed in parallel if resourced that way — but doing it first means Phase 4's new screens (member lists, invite flow, share sheets) get built against the real app shell and theme system instead of the Phase 1/2 scaffold, avoiding a second retrofit later.

---

*Phase 0 — repo scaffold — is complete. Phase 1 — auth & domain core — is complete: List/Category/Item migrations, models, and default category seeding are done; the auth starter kit (signup/login/logout) supports token refresh; the Settings page shell with the `/api/v1/meta` version footer is done.*

*Phase 2 — list & item CRUD — functionally complete end-to-end (backend + frontend); a handful of testing/polish gaps remain before it should be considered fully done:*
- *Backend: migrations/models/API for `FavoriteItem`, `Store`, `ListStore`, `StoreCategoryOrder`; REST endpoints for list CRUD, item CRUD (quantities/notes/checked/soft-delete+restore, bulk paste import), category customization (create/rename/reorder, with global defaults forked into list-scoped overrides tracked by a `forkedFromId` lineage column so renames don't un-shadow the original), basic keyword-based auto-categorization (`app/services/auto_categorize_service.ts`), the favorites master list with one-tap "add to list", and store attach/create + per-store category reordering. `apps/api`'s 100% coverage policy from §11 is now actually wired up (it wasn't before — `c8` wasn't even a dependency): `apps/api/.c8rc.json` scopes coverage to `app/**` (controllers/models/services/transformers/validators — the application logic; framework bootstrap like `bin/`, `config/`, `providers/`, and the generated `database/schema.ts` are out of scope, same rationale as excluding a top-level `main()` per §11) with `lines`/`branches`/`functions`/`statements` thresholds at 100 and `check-coverage: true`; `pnpm --filter @everylist/api test` now runs `c8 node ace test` and fails the build if any of those regress. Getting there added ~15 functional/unit tests for real gaps the audit surfaced (untested endpoints like category delete and store detach/category-fetch, ownership/soft-delete guards on list update, the auto-categorization keyword tie-break and no-match paths, reorder's invalid-id skip branch, etc.) and one dead-branch cleanup (`User.initials`' `?? ''` fallback, unreachable at runtime but required by `noUncheckedIndexedAccess`, now has a `c8 ignore` with a justifying comment per §11's rule). `packages/shared` already had its own 100% Vitest gate; `apps/web`'s Vitest coverage config is still unwired — see the gaps list below.*
- *Deliberately deferred to Phase 4: all of this is owner-only for now (`List.ownerId` checks) since `ListMember`/sharing doesn't exist yet — the plan's "store visible to everyone the list is shared with" behavior (§7) will start working once Phase 4 lands membership.*
- *Frontend: login/signup; a list index with create; a list detail page (add item, check/uncheck grouped by category, paste import, remove, recently-deleted/restore); a categories screen (rename, reorder, create, delete list-scoped categories — renaming a default forks it, per §7); a favorites screen (create/remove, one-tap add-to-list with a list picker); and a stores screen + per-store aisle-order screen (attach/create/remove a store, pick "currently shopping at" — stored client-side only, per §7/§9 — and reorder that store's categories, which the list detail page then uses to order its groups). All wired through a small `$lib/api/*` client (bearer token in localStorage, `@everylist/shared` DTOs). Because routes like `/lists/[id]` have params unknown at build time, `apps/web` now builds with adapter-static's `fallback: '200.html'` instead of being fully prerendered, and `apps/api/start/routes.ts` grew a catch-all route to serve that shell for direct navigation/refresh on such routes (verified by hand against a built image: `/`, `/lists`, `/lists/:id`, and unmatched `/api/v1/*` all resolve correctly). Category icon fields are now the real §4/§7 picker: `@mdi/js`'s ~7,000 glyphs load via a dynamic `import()` into their own chunk (verified in a real production build — a ~2.8MB chunk, isolated from every route bundle, which all stay a few KB), never touching the initial app-shell bundle; `IconPicker.svelte` requires 2+ search characters before searching and, as of the loose-end cleanup noted below, renders matches through a real windowed grid (only the scrolled-into-view rows plus a small overscan ever hit the DOM, no fixed result cap) rather than the earlier 60-result-cap workaround; `Icon.svelte` resolves a stored name (e.g. `"fruitCherries"`) to path data and falls back to a generic glyph if a name doesn't resolve, matching §7's stated behavior.*
- *Fixed since the above: the production image had no step that ever ran `node ace migration:run` against `/config/everylist.sqlite3` — a fresh `/config` volume booted with no schema at all, and any Phase 2 endpoint that touched the DB would have failed. Added `docker/root/etc/cont-init.d/30-migrate`, which runs migrations (non-interactively, via `--force`) after `20-app-key` and before the app starts, per §5's zero-config startup rule.*
- *Component tests for every new page and component are now in place (`vitest-browser-svelte`, real Chromium via `@vitest/browser-playwright`) — the browser-mode project was previously unusable in this sandbox (`playwright-core` expects revision 1234, the sandbox only caches revision 1194) and is fixed with a conditional `executablePath` override in `vite.config.ts` that only activates when that exact sandbox path exists, so CI's own `playwright install`-provisioned browser is untouched. `apps/web`'s §11 coverage gate is now wired up too (`vitest run --coverage`, v8 provider, `all`-style reporting over `src/**`, excluding trivial SvelteKit route-config files for the same reason `apps/api` excludes its framework bootstrap) — not yet the eventual 100%, but a real, currently-met floor (90/72/91/91% lines/branches/functions/statements) that fails the build on regression. The gap to 100% is almost entirely the same repeated shape: `err instanceof ApiError ? err.message : 'generic fallback'` catch branches in a handful of mutation handlers (remove/save/reorder failure paths) that aren't all exercised yet. Also removed `src/routes/demo/` and `src/lib/vitest-examples/` — unreferenced `sv create` scaffold example code with no connection to EveryList, cleaned up rather than counted against coverage.*
- *Manually verified end-to-end against a live API: booted `apps/api` (migrated + seeded) and `apps/web`'s dev server together, then drove a real Chromium instance through signup → create list → add item (auto-categorized under "Produce") → categories page → icon picker search (found a real `@mdi/js` "Cheese" icon) → create store → create favorite. All steps passed against real HTTP responses, not mocks.*
- *Known gaps as of the above: (1) frontend coverage was at a real ~90% floor, not the eventual 100%; (2) the icon picker's capped/search-gated grid stood in for true virtualization. Both are closed — see the loose-end cleanup note below. The one gap that's still open by design: (3) the PWA/service-worker precaching of the icon-picker chunk described in §4 depends on Workbox/`vite-plugin-pwa` infrastructure that hasn't been built yet (tracked separately, not a Phase 2 regression — no service worker exists in the app at all yet; owned by Phase 5).*
- *Loose-end cleanup (2026-08-14), closing the two gaps above before Phase 4 started: `IconPicker.svelte` now renders a real windowed grid — only the rows scrolled into view (plus a small overscan) ever hit the DOM, tracked via `scrollTop`/row-height math and top/bottom spacer padding, instead of the earlier 60-result cap; a search like "ar" (hundreds of `@mdi/js` matches) now renders a bounded DOM regardless of match count and reveals more results as the container scrolls. `apps/web`'s coverage gate is now the real §11 policy — all four `vite.config.ts` thresholds raised from the 90/72/91/91 floor to 100/100/100/100 — after closing the remaining gaps: the repeated `err instanceof ApiError ? … : 'generic fallback'` catch branches across list/category/store/favorite mutation handlers, the OS-theme-change listener in `theme.ts`, an unfilled "Name (optional)" field on signup (its `bind:value` write path had never been exercised), and several smaller branches across the settings/login/list-index pages. One exception is documented rather than forced: `lib/api/selected-store.ts`'s two-line read path is provably covered in isolation (run `selected-store.svelte.spec.ts` alone and the file reports 100%), but two other spec files' `vi.mock('$lib/api/selected-store', …)` corrupts this file's V8 line/branch attribution once merged into the full suite — a Vitest browser-mode coverage-collection artifact, not missing coverage, so it carries a justifying `/* v8 ignore */` comment rather than a lowered threshold, the same precedent apps/api set with `User.initials`.*

*Phase 3 — UI/UX Redesign & Theming Foundations — complete (see §16 for the full brief and its per-deliverable status):*
- *Theming (from the first Phase 3 slice): class-based dark mode (`@custom-variant dark` over Svelte's `.dark` root class, not just the `prefers-color-scheme` media query Phase 1/2 pages leaned on piecemeal), a `light`/`dark`/`automatic` preference persisted to `localStorage` and applied via `$lib/theme.ts`, a blocking inline bootstrap script in `app.html` so there's no flash of the wrong theme on load, and app-wide `bg`/`text` tokens on the root layout so the many pre-existing `dark:text-*` utilities from Phase 1/2 now actually sit on a matching dark background instead of white. A persistent bottom navigation (Lists / Favorites / Settings) was added to the root layout, shown whenever a token is present and the route is under one of those three sections.*
- *Backend: `ListDto` gained an `itemCount` field (count of undeleted, unchecked items) — `apps/api/app/controllers/lists_controller.ts`'s `index`/`show`/`update` queries eager-load it via Lucid's `.withCount('items', ...)`, and `ListTransformer` reads it back with the framework's `this.whenCounted('items')` helper (falling back to `0`, which is also correct for a freshly-created list with no items yet). No schema change — computed entirely from the existing `items` relation.*
- *Frontend, app shell: a shared `PageHeader.svelte` (optional back-link, optional title, optional `actions` snippet) replaces the one-off `<h1>` + inline-link markup every route previously rolled itself — used across the Lists index, list detail, categories, stores, per-store aisle order, Favorites, and Settings pages.*
- *Frontend, list index: rows are now cards showing the list's `Icon` (via the existing `Icon.svelte`, falling back to a generic list glyph for lists created before this phase had no icon set) over its `List.color` swatch, plus an "N items" meta line from the new `itemCount` field. The create form gained `IconPicker`/`ColorPicker` controls so new lists can set both at creation instead of only via direct API calls.*
- *Frontend, category headers: list-detail section headers now render the category's icon (`Icon.svelte`, using the picker-backed `Category.icon` values Phase 2 already stored) and are tinted with the parent list's `List.color` — see §16 deliverable 4's note on why this is a list-wide accent rather than a per-category one (`Category` has no `color` column).*
- *Frontend, store form: a new `ColorPicker.svelte` component (fixed 18-swatch popover grid, same interaction pattern as `IconPicker.svelte`) is wired into the store-create form and each store row now shows its color swatch — see §16 deliverable 5's note on why this is a color picker rather than an icon picker (`Store` has no `icon` column).*
- *Frontend, Settings: restructured from a single paragraph into three labeled grouped-row sections — Account (a "Log out" row, in addition to its existing spot on the Lists page), Appearance (the existing theme control), and About (the `/api/v1/meta` build-info footer, now inside its own section instead of a bare `<footer>`).*
- *Testing: every new/changed component and page got test coverage in the same pass (`ColorPicker.svelte.spec.ts`, `PageHeader.svelte.spec.ts`, updated fixtures adding `itemCount` to every hardcoded `ListDto` literal across the existing page specs, new assertions for the item-count meta line, the category-header accent color, and the Settings logout flow) plus a new backend functional-test path exercising `itemCount` through create → add item → check item → verify it drops out of the count. `apps/api` stayed at 100% coverage; `apps/web`'s coverage gate was still on its interim floor at the time (136 tests, ~91% statements/lines, ~91% functions, ~76% branches) — since closed to the real 100% policy, per the loose-end cleanup note above. Both workspaces are lint- and typecheck-clean.*

*Favorites re-scoped to per-list (2026-08-14), a retroactive MVP-scope correction: `FavoriteItem` previously had no `listId` at all (unique on `userId, name` only) — a global "master list" that doesn't actually make sense once lists stop being interchangeable (a grocery list's go-to items have nothing to do with a camping-trip packing list's). `FavoriteItem` gained a required `listId` (FK → `lists`, cascade delete) and the uniqueness constraint moved to `(listId, name)`, so the same item name can be favorited independently per list. Since the app is still pre-launch, this was a clean migration (`migration:fresh` + `schema:generate`) rather than a data-preserving backfill — any pre-existing favorite rows were dropped rather than assigned a guessed list. Routes moved from a top-level `/favorites` collection to `/lists/:listId/favorites`, matching how categories/items/stores are already list-nested; `addToList` simplified to `POST /lists/:listId/favorites/:id/add-to-list` (no second `listId` param — a favorite only ever re-adds to the list it already belongs to). The frontend's standalone `/favorites` page and its bottom-nav tab are gone; favorites now live at `/lists/[id]/favorites`, linked from the list detail page's header actions alongside Stores/Categories. `BottomNav` dropped to two sections (Lists/Settings).*

*Phase 4 — Sharing & real-time — complete (2026-08-14), per the design in `foundational/PHASE4_PLAN.md` (kept alongside this file as the phase's detailed design record). Scope decisions locked in before implementation: join-link/code invites only (no email send — SMTP2GO invite delivery deferred), full entity scope (List/Category/Item/FavoriteItem/Store/StoreCategoryOrder all move to membership checks and broadcast), Transmit with the local in-process transport, and no per-entity `version`/conflict-resolution columns (that's Phase 5's job — `SyncEvent` here exists only to drive broadcasts).*
- *Backend: new `list_members`, `list_invites`, and `sync_events` tables/migrations — `list_members` backfills one `owner` row per pre-existing list in the same migration so existing owners aren't locked out the moment `ownerId` checks are replaced. A new `app/policies/list_policy.ts` (`requireList`/`requireStoreRole`, role-ranked `viewer < editor < owner`) replaces all 9 prior `.where('ownerId', ...)` call sites across `lists_controller.ts`, `categories_controller.ts`, `items_controller.ts`, `favorite_items_controller.ts`, and `stores_controller.ts` — a list/store that doesn't exist and one the caller isn't a member of both 404 (membership isn't probeable by id), a member below the required role gets 403. New `list_members_controller.ts` (list/update-role/remove, guarded against demoting or removing a list's last owner), `list_invites_controller.ts` (create/list/revoke, editor+), and a top-level `invite_accept_controller.ts` (`GET /invites/:token` unauthenticated preview, `POST /invites/:token/accept` authenticated — upgrades an existing membership's role but never downgrades it). `@adonisjs/transmit` added with the local transport; `start/transmit.ts` authorizes `list/:id` channel subscriptions against `ListPolicy.roleFor` via an extracted, directly-unit-testable `authorizeListChannel` function. A new `app/services/sync_broadcaster.ts` persists a `SyncEvent` row and calls `transmit.broadcast()` on every mutating action across all six entity types, including a `broadcastToStoreLists` fan-out so a Store/StoreCategoryOrder edit reaches every list it's attached to — the broadcaster singleton is swappable (`setSyncBroadcasterForTesting`) for tests. `apps/api` stayed at 100% coverage throughout (new `list_policy.spec.ts`, `sync_broadcaster.spec.ts` unit tests; new `list_members.spec.ts`, `list_invites.spec.ts` functional tests; every existing functional spec extended with an owner/editor/viewer/stranger role matrix).*
- *Shared DTOs: `packages/shared/src/domain.ts` gained `ListRole`, `ListMemberDto`, `ListInviteDto`, `ListInvitePreviewDto` (deliberately narrower than `ListInviteDto` — no token/ids, safe to serve pre-auth), and `SyncEventDto`.*
- *Frontend: `$lib/api/members.ts` and `$lib/api/invites.ts` (thin typed clients, matching the existing `stores.ts` pattern); a new `$lib/api/auth.ts#fetchProfile` (`GET /account/profile`, previously unused by the frontend) so the members page can determine the caller's own role for UI gating. `$lib/realtime.ts` wraps `@adonisjs/transmit-client`, attaching the bearer token via `beforeSubscribe` and exposing `subscribeToList(listId, onEvent) → unsubscribe`; a new `SyncToast.svelte` renders the "list was modified" toast. The list-detail page subscribes on mount/unsubscribes on destroy and shows the toast on any event, with a "Refresh" action that re-runs its existing load — no silent auto-merge, matching the "no conflict resolution until Phase 5" scope decision. New `lists/[id]/members/+page.svelte` (role list with change/remove for owners, read-only for everyone else; invite-link create/copy/revoke UI) and `join/[token]/+page.svelte` (pre-auth preview; accept-and-open-list when logged in; login/signup links carrying `?next=/join/[token]` when logged out) — both routes are `prerender = false`/`ssr = false` like the app's other dynamic-id pages. `login`/`signup` now redirect to the `next` query param when present (guarded to only read `page.url.searchParams` in the browser, since both pages are otherwise prerendered static routes and reading search params during SSR prerendering throws). `apps/web` stayed at 100% coverage throughout (new `members.spec.ts`, `invites.spec.ts`, `realtime.spec.ts`/`realtime.svelte.spec.ts`, `SyncToast.svelte.spec.ts`, the members and join page specs, and extended list-detail/login/signup specs) — one new component-level exception documented rather than forced, matching the existing `selected-store.ts`/`User.initials` precedent: `lib/api/token.ts`'s `getToken` and `lib/realtime.ts`'s client-singleton branch are each provably covered in isolation but have their V8 attribution corrupted by other spec files' `vi.mock(...)` once merged into the full suite.*
- *Verified end-to-end against a live, freshly-migrated API (no mocks): signed up two real users, created a list as user A, minted an editor invite link, previewed it unauthenticated, accepted it as user B, confirmed both members and roles were correct, confirmed B's editor role could create items but not perform owner-only actions (list update) or member management (both 403). Both `apps/api` and `apps/web` production builds succeed; both workspaces are lint- and typecheck-clean.*

*Phase 5 — Offline & PWA — complete (2026-08-15), per the design in `foundational/PHASE5_PLAN.md` (kept alongside this file as the phase's detailed design record). This is the MVP-complete milestone (§14). Scope decisions locked in before implementation: conflicts resolve as silent merge + toast rather than a dedicated conflict-review screen; the soft-delete columns added to Category/FavoriteItem/Store/StoreCategoryOrder exist purely for offline-delete-safety and got no new recovery UI (Item/List recovery UI already existed and is untouched).*
- *Backend: every syncable table (`lists`, `categories`, `items`, `favorite_items`, `stores`, `store_category_orders`) gained a `version` column; `categories`/`favorite_items`/`stores`/`store_category_orders` also gained `deletedAt` (soft-delete, matching the existing Item/List pattern). Update/delete validators gained an optional `expectedVersion`; a new `app/services/version_conflict.ts` (`hasVersionConflict`/`parseExpectedVersion`) is checked by every mutating controller action — a match applies and bumps `version`, a mismatch returns 409 with `{ data: <current row>, conflict: true }` and no mutation, an omitted `expectedVersion` behaves exactly as before (existing online-only callers are unaffected). `sync_broadcaster.ts`'s payload gained `version`. Extended every touched functional spec with the omitted/matching/stale-version matrix; `apps/api` stayed at 100% coverage throughout.*
- *Shared: `apps/api`'s `auto_categorize_service.ts` moved verbatim into `packages/shared/src/auto-categorize.ts` (a pure function with no Adonis/Lucid dependency, needed client-side too for offline category guessing) and is now consumed by both apps. `domain.ts` gained `version`/`deletedAt` fields across the affected DTOs, a new `StoreCategoryOrderDto`, and `ConflictResponse<T>`.*
- *Frontend, offline storage: a new `$lib/offline/` module — `db.ts` (Dexie, one table per syncable entity plus a local-only `selectedStore` table and a `syncQueue` table), `sync-queue.ts` (enqueue/dequeue/update/count helpers), and `sync-engine.ts` (`offlineCreate`/`offlineMutate`: write optimistically to Dexie under a negative client-generated temp id, enqueue the mutation, attempt it immediately if online, replace the optimistic row with the server's response on success). `$lib/api/{items,categories,favorites,stores}.ts` were rewired onto this engine for their per-row create/update/delete calls — bulk operations (category/store-category reorder) and join-table ops (attach-existing-store, add-favorite-to-list) stayed online-only, since they don't map cleanly onto the single-row temp-id/version-conflict model. `$lib/api/selected-store.ts` moved from `localStorage` to the Dexie `selectedStore` table (now async).*
- *Frontend, sync/flush: `$lib/offline/flush.ts` drains the `pending` queue oldest-first by replaying each `QueuedMutation`'s exact stored request (`url`/`payload`/`expectedVersion`) generically rather than through an entity-specific dispatch table; network failures retry with jittered exponential backoff (2s base, 60s cap), a 409 overwrites the local cache with the server's authoritative row and notifies a conflict listener (the "silent merge" half of the confirmed UX), and Background Sync registers as a progressive enhancement alongside the guaranteed `online`-event listener. A new `SyncStatusBanner.svelte` (pending/failed count, manual "Retry now") is mounted in the root layout for logged-in users. `$lib/api/client.ts`'s `ApiError` gained a `body` field so the flush loop can read a 409's conflicting row out of the response. The list-detail page's realtime handler now suppresses an incoming `SyncEvent` for any row with an unacked local edit (`_dirty: true` in Dexie) via a new `isRowDirty()` helper — a granular live-merge for non-dirty rows was scoped out, since the sync broadcast payload doesn't carry the full updated entity, only metadata.*
- *Frontend, PWA: `vite-plugin-pwa` in `generateSW` mode (plain, not `@vite-pwa/sveltekit` — it operates on the built output via Vite's build hooks regardless of adapter, sidestepping needing to verify a SvelteKit-specific integration against `adapter-static`'s non-default `fallback: '200.html'` output) precaches the app shell, serves an offline navigation fallback, and stale-while-revalidates `GET /api/v1/*`. `icon-192.png`/`icon-512.png` copied from `branding/` into `static/` for the manifest — the existing `icon.svg` isn't safe-zone padded for a true maskable icon, so only `any` purpose is declared. A new `$lib/pwa/install-prompt.ts` captures `beforeinstallprompt` and exposes `isStandalone`/`isIOSSafari`; `InstallPrompt.svelte` shows an install button in Settings' About section on Chromium, a static "Add to Home Screen" hint on iOS Safari (which never fires `beforeinstallprompt`), and nothing once already running standalone.*
- *Testing: `apps/web` stayed at the 100%-across-four-metrics coverage gate throughout — new `db.spec.ts`/`db-no-indexeddb.spec.ts`, `sync-queue.spec.ts`(+ no-indexeddb variant), `sync-engine.spec.ts`(+ no-queue-id variant), `flush.spec.ts`(+ no-indexeddb and two loop-scheduling variants), `SyncStatusBanner.svelte.spec.ts`, `install-prompt.spec.ts`/`install-prompt.svelte.spec.ts`, `InstallPrompt.svelte.spec.ts`, plus extended specs for every rewired API module and the list-detail page's dirty-row suppression. A few new justified `/* v8 ignore */` exceptions follow the existing `selected-store.ts`/`token.ts` precedent (cross-file `vi.mock` coverage-attribution corruption, not missing coverage) rather than lowering the threshold. `playwright.config.ts` got its first real spec file: `e2e/offline-sync.e2e.ts` runs against `vite dev` + a real AdonisJS dev server (both on dedicated ports against a disposable SQLite file) rather than the plain `build && preview` server, which has nowhere to proxy `/api/v1/*` to — it signs up for real, creates a list, goes offline, adds an item (asserting the optimistic render and the sync banner's pending count), goes back online, waits for the banner to clear, then reloads and confirms the item persisted server-side.*
- *Verified manually: a production build's `sw.js`/`manifest.webmanifest` were inspected directly off a `vite preview` server — the precache manifest, the `/200.html` navigation fallback route, and the `/api/v1/*` `StaleWhileRevalidate` rule are all present and correctly generated. Both `apps/api` and `apps/web` production builds succeed; both workspaces are lint- and typecheck-clean.*

*Phase 6 — item-store tagging, prices, folders, badge counts, export — complete (2026-08-15), per §3's narrowed scope for the "Stores & store filtering," "Prices & budget tracking," "List folders," and "Badge exclusion" rows. Landed across `9e9d55d`/`76fbb7c`/`a018431`/`47a2277`/`9fe731d`, squashed into `6e3ef8f`. This closing note was added retroactively — the phase shipped without one, unlike Phases 3–5.*
- *Item-to-store tagging + filtering: `Item.storeId` (nullable FK → `stores`, on top of the `Store`/`ListStore`/`StoreCategoryOrder` entities Phase 2 already shipped), a store filter on the list-detail view that narrows the visible items to one store at a time.*
- *Prices & budget: `Item.price` (integer cents, matching the Stripe-style convention noted in `packages/shared/src/domain.ts`), summed into a running total shown on the list-detail page.*
- *List folders: `Folder` model/migration (`apps/api/app/models/folder.ts`) and `List.folderId`, with folder grouping surfaced on the list index (`apps/web/src/routes/lists/+page.svelte`).*
- *Badge counts & exclusion: `List.badgeExcluded` plus the Web Badging API integration (`apps/web/src/lib/pwa/badge.ts`), degrading gracefully to in-app-only counts where the API isn't available, per §9.*
- *Email export: SMTP2GO-backed `POST /lists/:id/export/email` (`apps/api/app/controllers/list_export_controller.ts`, `apps/api/app/mails/list_export_mail.ts`), alongside the print stylesheet already shipped in the MVP milestone.*
- *Both `apps/api` and `apps/web` stayed at their 100% coverage gates throughout.*

*Phase 7 — Polish — complete (2026-08-15), per the design in `foundational/PHASE7_PLAN.md` (kept alongside this file as the phase's detailed design record). This is the last planned phase (§14). Scope decisions locked in before implementation: passcode lock is a simple client-computed PIN hash, not WebAuthn — a local shared-device deterrent, not a cryptographic secret (any list member already has full API access to the list); personalized categorization is frequency-based over existing `Item` history, not a trained ML model.*
- *Passcode lock: `List.passcodeHash` (nullable, no FK — safe per the `AGENTS.md` cascade-delete footgun), round-tripped through the existing `PATCH /lists/:id` update path (owner-only, already enforced by `ListPolicy`) rather than a bespoke endpoint. The client computes `SHA-256(salt + pin)` via Web Crypto (`apps/web/src/lib/passcode.ts`) — the server only ever stores/returns the opaque `"<salt>:<hash>"` string, so unlocking works fully offline against the service worker's already-cached `GET /api/v1/lists/:id` response, no new Dexie table needed. `PasscodeGate.svelte` replaces only the list-detail page's *body* when locked — `PageHeader`/`ListMenu` stay reachable, so an owner can always clear a forgotten passcode via the always-visible menu (owner-role-gated server-side, not PIN-gated) rather than needing a separate recovery flow. Session-scoped unlock (`sessionStorage`) so re-entry isn't needed every navigation within a tab session. List index cards show a lock badge for protected lists.*
- *Personalized categorization: new `apps/api/app/services/category_suggestion_service.ts` looks up this list's own past `Item` rows for an exact (case-insensitive) name match with a set `categoryId`, picks the most frequent, and falls back to the existing static keyword table (`packages/shared/src/auto-categorize.ts`) when there's no history — list-scoped, not per-user, matching how `Category` overrides already work. `resolveCategoryId` in `items_controller.ts` now calls this service, so item creation itself got smarter, not just a new endpoint. New `GET /lists/:listId/items/categorize?name=` (viewer role) backs the client's optimistic-row guess in `items.ts`; on failure (offline, never cached) it falls back to the original local static-table lookup unchanged — reusing the service worker's existing `StaleWhileRevalidate` cache for `/api/v1/*` rather than adding new offline-cache plumbing.*
- *Extra accent themes: `layout.css` gained three more `[data-accent='...']` blocks (Forest/Berry/Sunset) alongside the existing Ocean palette, all redefining the same `--color-primary-*` custom properties Tailwind v4's generated utilities already read at runtime — zero component-level changes needed, confirming §16's prediction that this would be "cheap once the light/dark foundation exists." New `$lib/accent.ts` mirrors `theme.ts`'s exact structure (`localStorage`, SSR guard, `data-accent` attribute on `<html>`); `app.html`'s inline bootstrap script applies it before first paint alongside the existing dark-mode bootstrap, so there's no FOUC on either axis. Settings' Appearance section gained a 4-swatch accent picker next to the theme radiogroup.*
- *Performance/accessibility hardening: no Lighthouse or axe-core setup existed anywhere before this phase — also found and fixed in passing, `apps/web`'s `test:e2e` Playwright suite (including the Phase 5 offline-sync spec) was never actually wired into any CI workflow, and had silently rotted against the Phase 6 "move list creation to its own screen" UI change (fixed: `e2e/offline-sync.e2e.ts` now navigates through `/lists/new` correctly, and uses a list name distinct from the seeded starter "Groceries" list to avoid an ambiguous locator match). New `e2e/accessibility.e2e.ts` runs `@axe-core/playwright` against the login page and a real authenticated list-detail page — real violations were found and fixed: the app-wide viewport meta had `user-scalable=no` (blocks pinch-zoom, a straight WCAG 1.4.4 violation, removed), several `text-primary-600`-on-white link/label instances measured 4.09:1 contrast against the WCAG AA 4.5:1 minimum for normal text (bumped to `text-primary-700` throughout — `PageHeader`, `BottomNav`, `ListMenu`, the list-detail "Show/Restore" links, login/signup/join's inline auth links, favorites/stores links), `text-gray-400` on the item list's "Remove" button measured 2.6:1 (bumped to `text-gray-500`), and login/signup's inline "Sign up"/"Log in" links relied on hover-only color to read as links (`axe`'s `link-in-text-block` rule) — now permanently `underline`. Both a11y spec runs are 0 violations. New `scripts/lighthouse-check.mjs` (wired into CI as new steps in the `docker-smoke` job, auditing the already-booted production container rather than building a second image) found accessibility and best-practices both already at 100, but performance at a real 55 against `vite dev` — invalid, since dev builds are unminified/unbundled/HMR-instrumented, so the harness was corrected to always audit a production build (the Docker image, or `LIGHTHOUSE_BASE_URL` pointed at one). Against the real production build, performance was 67, root-caused to `layout.css`'s `@source '.../flowbite-svelte/dist'` scanning Tailwind classes from all ~40 flowbite-svelte components though this app imports only 8 (Button/Checkbox/Helper/Input/Label/Radio/Select/Textarea) — narrowed to just `dist/forms` and `dist/buttons`, cutting the compiled CSS from ~254KB to ~123KB and performance to 72 (verified with no visual regression: full test suite still green, and the login/list-detail/settings pages were screenshotted against the rebuilt image and look identical). The remaining gap was root-caused too: the same ~230KB chunk is flowbite-svelte's own JS (component logic + `tailwind-variants`) not tree-shaking down to the 8 imported components — a real fix (replacing those components or a deeper package-exports investigation) is out of scope for this pass, so `THRESHOLDS.performance` in `lighthouse-check.mjs` is honestly set to 65 (a regression guard against today's measured 72, not a claim that PLAN.md §13's 90 target is met) with the gap and root cause documented in the script itself.*
- *Both `apps/api` and `apps/web` stayed at their 100% coverage gates throughout (new `category_suggestion_service.spec.ts`-equivalent unit coverage folded into `items.spec.ts`'s functional tests, `lists.spec.ts`'s passcode round-trip test; new `passcode.spec.ts`/`passcode.svelte.spec.ts`, `accent.spec.ts`/`accent.svelte.spec.ts`, `PasscodeGate.svelte.spec.ts`, and extended `ListMenu.svelte.spec.ts`, list-detail/list-index/Settings page specs, and `items-offline.spec.ts`).*

*Performance gap re-investigated (2026-08-15), closing out the one open item this phase left: confirmed via a fresh Lighthouse run against a real production Docker image that Performance is still a real 72, and tested the specific fix the closing note above speculated about — switching all 18 files' `import { X } from 'flowbite-svelte'` to per-component deep imports (`flowbite-svelte/Button.svelte`, etc.) to bypass the package's barrel `dist/index.js`, on the theory the barrel was pulling in unused-component code. It wasn't: direct inspection of the ~230KB JS chunk both before and after found zero bytes of code from any unused component (no Accordion/Modal/Datepicker/etc. strings present either way), and the rebuild after the import-path change was byte-for-byte the same size — Rollup was already tree-shaking the barrel correctly. The change was reverted (no benefit, added boilerplate). The actual weight is `tailwind-merge`'s fixed class-conflict-resolution config data, pulled in by `tailwind-variants` (which every flowbite-svelte component's styling goes through) — a largely-fixed cost that doesn't shrink with fewer components. `scripts/lighthouse-check.mjs`'s header comment is corrected accordingly. The only real fix remains what the phase's closing note already named: replacing the 8 flowbite-svelte components (Button/Checkbox/Helper/Input/Label/Radio/Select/Textarea) with lighter hand-rolled equivalents that skip tailwind-variants/tailwind-merge entirely — real scope touching every form in the app, deliberately not undertaken here. `THRESHOLDS.performance` stays at 65 as a regression guard against the confirmed-current 72; §13's 90 target remains unmet by design, not by oversight.*
