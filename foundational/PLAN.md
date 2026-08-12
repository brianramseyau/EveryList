# EveryList — Foundational Plan

Status: **Draft for review — no implementation has started.**
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

- **MVP (Phase 1–4 below):** the core list-management loop — create, share, categorize, check off, favorite, recover, import, and use fully offline.
- **Phase 5+ (stretch):** high-value AnyList "Complete" features that are pure software (stores/filtering, prices/budget, folders, themes, passcode) and don't require a native shell.
- **Explicitly out of scope:** anything requiring native OS integration a PWA cannot provide (Siri/Alexa voice, Apple Watch, home-screen widgets, geofencing) or third-party commercial fulfillment APIs (Instacart, Walmart, Kroger, etc.). These are flagged below with rationale, not silently dropped, so the decision is visible and revisitable.

---

## 3. Feature Decision Matrix

| AnyList Feature | Tier | Decision | Rationale |
|---|---|---|---|
| Unlimited lists | Free | **MVP** | Core. |
| Real-time sharing | Free | **MVP** | Core differentiator; SSE-based live updates. |
| Smart autocomplete & auto-categorization | Free | **MVP** (basic) | Seeded category keyword matching; ML-personalized suggestions deferred to Phase 6. |
| Category customization (reorder/rename/create/icon) | Free | **MVP** | Needed for auto-categorization to be trustworthy. Ordering is scoped **per store** (see below), with a per-list default order as the fallback when no store is selected. Icon choice is the *full* Material Design Icons set (~7,000+ glyphs via `@mdi/js`), not AnyList's short fixed list — see §4/§7. |
| Store selection & per-store aisle order *(new — not a literal AnyList feature)* | Free | **MVP** *(pulled forward from Phase 5)* | Pick the store you're shopping at; categories reorder to match that store's real aisle layout. The `Store` entity and its category-order data are shared with everyone the associated list(s) are shared with — see §7. This is the piece of AnyList's "Stores & Store Filtering" premium feature that matters most day-to-day; item-tagging/filtering (below) stays deferred. |
| Favorites (master list) | Free | **MVP** | Core loop for repeat shopping. |
| Recent items (restore checked/deleted) | Free | **MVP** | Cheap with soft-delete, high value. |
| Quantities & notes | Free | **MVP** | Core item fields. |
| Copy & paste import | Free | **MVP** | Simple parser, high leverage. |
| Print & email export | Free | **MVP** (print only, email deferred) | Browser print stylesheet is trivial; outbound email (SMTP2GO, see §15) ships in Phase 5. |
| Uncompleted item badge count | Free | **Phase 5** | Web Badging API, partial browser support; app-shell first. |
| Home screen install (PWA) | Free (native widget) | **MVP** (install/manifest), widgets **out of scope** | PWA installability ≠ native home-screen widgets; widgets need a native shell (Capacitor), not planned. |
| Voice Assistant (Siri/Alexa) | Free | **Out of scope** | Requires native intents/skills; not achievable from a PWA. Revisit only if a Capacitor wrapper is built later. |
| Online grocery fulfillment (Instacart, etc.) | Free | **Out of scope** | Requires commercial partner API agreements; not a lean-engineering decision. |
| Item photos | Premium | **Phase 5** | Needs object storage; deferred, not architecturally hard. |
| Stores & store filtering | Premium | **Phase 5** *(narrowed)* | The `Store` entity itself ships in MVP (see above); Phase 5 adds tagging individual items with a store and filtering the list view to only that store's items. |
| Prices & budget tracking | Premium | **Phase 5** | Adds price field + running total; depends on Stores. |
| Apple Watch app | Premium | **Out of scope** | Native-only platform. |
| List folders | Premium | **Phase 5** | Straightforward grouping entity. |
| Location-based reminders | Premium | **Out of scope (for now)** | Web Geofencing isn't reliably available; approximating with plain Geolocation + push is fragile. Revisit if PWA background geolocation matures. |
| Passcode lock | Premium | **Phase 6** | Client-side PIN gate (WebAuthn or local PIN) on sensitive lists. |
| Premium themes | Premium | **Phase 6** | Flowbite theming makes this cheap; light/dark mode ships in MVP, extra themes later. |
| Desktop & web access | Premium | **Already satisfied** | The product *is* the web app — no separate native client needed. |
| Badge exclusion | Premium | **Phase 5** | Ships alongside badge counts. |
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
| File storage | **Local filesystem** (`/config/uploads`) | Item photos, Phase 5. Kept behind a storage-service interface so swapping in an S3-compatible backend later is a config change, not a rewrite. |
| Outbound email | **SMTP2GO** (via Adonis `mail` SMTP transport) | Invite emails (Phase 3) and list export emails (Phase 5); credentials via env vars, not committed. |
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
                              │  uploads/ (Phase 5)      │
                              └──────────────────────────┘
```

**Deployment shape:** a single Docker image, built on an s6-overlay base image (mirroring LinuxServer.io's own pattern), so `PUID`/`PGID` environment variables control filesystem ownership exactly the way LSIO images do — the init stage remaps the container's app user to the supplied IDs and `chown`s `/config` before dropping privileges and starting the app. Inside the container there is exactly **one Node process**: AdonisJS serves both the REST/SSE API and the static SvelteKit build, so the container exposes exactly one HTTP port and needs no internal reverse proxy. All persistent state — the SQLite database file and, from Phase 5, uploaded item photos — lives under a single `/config` volume, which also makes Unraid appdata-backup plugins trivial to use for backups. This is a single-instance deployment target by design; no clustering/multi-node concerns apply (see the in-memory rate-limit store and Transmit local transport in §4).

**Standing rule — zero-config startup:** every environment variable the Dockerfile can sensibly default, it must default, directly via `ENV` instructions in `docker/Dockerfile` — not left to be supplied by the Unraid template or a `docker-compose.yml`, which are just one of several ways the image can be run. `HOST` (`0.0.0.0`), `PORT` (`3000`), and `NODE_ENV` (`production`) are baked in this way, as are `PUID`/`PGID` (`99`/`100`, the standard LSIO "nobody"/"users" defaults — see §5's `PUID`/`PGID` remap above), so `docker run ghcr.io/brianramseyau/everylist` with no `-e` flags at all and only a `/config` mount is a valid, working invocation. The corollary: **no environment variable that cannot be safely defaulted is allowed to prevent the container from starting.** The one such variable in this plan is `APP_KEY` (AdonisJS's encryption/signing key) — it can't ship with a shared baked-in default without breaking every deployment's security, but requiring the user to generate and paste one before first boot violates this rule. Instead, the s6-overlay init stage checks for `APP_KEY`: if unset, it looks for a previously-generated key persisted at `/config/app_key`; if that doesn't exist either, it generates one (`node ace generate:key`), persists it to `/config/app_key`, and exports it into the app's environment for that boot and every boot after. An explicitly-set `APP_KEY` env var always takes precedence over the persisted file. Net effect: the container always starts, with or without any configuration, and `docker/unraid-template.xml`'s `APP_KEY` field is convenience/override, not a hard requirement.

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
│   ├── root/                      # s6-overlay service defs copied into the image
│   │   └── etc/s6-overlay/s6-rc.d/...
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
- **List** — id, name, color/icon, ownerId, folderId (nullable, Phase 5), archived, badgeExcluded (Phase 5), passcodeHash (nullable, Phase 6), timestamps + `deletedAt`.
- **ListMember** — listId, userId, role (`owner` \| `editor` \| `viewer`), invitedAt, acceptedAt. Backs real-time sharing.
- **Category** — id, name, icon, sortOrder, listId (nullable = global default), isDefault. Seeded with standard aisle categories (Produce, Dairy, Meat, Bakery, Frozen, Pantry, Household, Other); per-list overrides for reorder/rename/custom categories; `sortOrder` here is the **fallback** order used whenever no store is selected (see `StoreCategoryOrder` below). `icon` stores an `@mdi/js` icon **name** (e.g. `"fruitCherries"`), not an SVG blob — the client resolves the name to path data at render time. `@mdi/js` is version-pinned (not auto-updated) so stored names don't silently break; the `Icon` component falls back to a generic "list item" glyph if a name ever fails to resolve, rather than rendering nothing.
- **Item** — id, listId, name, quantity, notes, categoryId, checked, checkedAt, sortOrder, storeId (nullable, Phase 5 — item-to-store tagging), price (nullable, Phase 5), photoUrl (nullable, Phase 5), createdBy, timestamps + `deletedAt` (backs Recent Items recovery).
- **FavoriteItem** — id, userId, name, defaultCategoryId, defaultQuantity. The "master list" for one-tap rebuild.
- **Store** *(MVP)* — id, name, color, createdBy (audit only, not an access-control owner). Not owned by a single user or a single list — see `ListStore` below for how visibility works.
- **ListStore** *(MVP)* — listId, storeId. Join table attaching a `Store` to one or more `List`s. A store becomes visible/selectable to everyone who is already a `ListMember` of any list it's attached to — this is how "shared via list membership" is implemented without inventing a second sharing/permission primitive; `editor`+ can rename the store or reorder its categories, `viewer` can select it and see the resulting order. Attaching an existing store to a second list (e.g. "Walmart" used for both a Groceries list and a Hardware list) just adds a row here — no duplication, and it becomes visible to that list's members too.
- **StoreCategoryOrder** *(MVP)* — storeId, categoryId, sortOrder. The per-store override of category order, edited via a "reorder categories for this store" screen. When rendering a list with a store selected, the app looks up `(store, category)` here for each category the list uses and falls back to that list's own `Category.sortOrder` for any category not yet customized for that store.
- **Folder** (Phase 5) — id, userId, name, color, sortOrder.
- **SyncEvent** — id, entityType, entityId, op (`create`/`update`/`delete`), version, updatedAt. Backs both the offline conflict check (client sends `lastKnownVersion`) and the Transmit broadcast payload.

**"Currently shopping at" is a local, per-device selection, not shared state:** the store you have selected while viewing a list is kept in the client (IndexedDB/localStorage), not written to the `List` row or broadcast over Transmit. Two household members shopping at different physical stores at the same time should each see categories ordered for *their* store, not have that flip out from under them because a co-shopper switched stores on a shared list. What *is* shared in real time is the underlying `Store` and `StoreCategoryOrder` data — so if one person edits "Walmart"'s aisle order, every household member's next visit to that store shows the update.

**Conflict resolution:** last-write-wins per item, keyed on a monotonically increasing `version` column bumped server-side on every mutation. The client's offline queue attaches the last version it saw; the server accepts if the version matches or is newer than what it has recorded as synced from that client, otherwise flags a conflict the client resolves by taking the server's copy and re-applying the local diff as a new edit (no silent data loss, no CRDT complexity for v1).

---

## 8. API & Real-Time Design

- REST, versioned under `/api/v1/...`, resource-oriented (`/lists`, `/lists/:id/items`, `/lists/:id/members`, `/favorites`, `/categories`, `/lists/:id/stores`, `/stores/:id/categories`).
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
- **Installability:** web app manifest with icons/splash screens, `display: standalone`, theme color; install prompt surfaced contextually, not nagged. App icon source lives at `branding/icon.svg` (PNG exports alongside it) — a cheeky, deliberately distinct riff on AnyList's dated, thin/wispy iOS-7-era checklist icon: a bold cyan-to-blue gradient squircle, a tilted clipboard with every row already checked off (the "every" vs. "any" pun), and an oversized two-tone checkmark stamp sweeping past the card's edge. Manifest icons (192/512, maskable variant) and favicon sizes are generated from this SVG during Phase 0/4 rather than hand-drawn per size.
- **Badge counts (Phase 5):** Web Badging API where available; degrades gracefully (in-app count only) where not.
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
| **3 — Sharing & real-time** | `ListMember` roles, invite/join flow, Transmit channels, live update UI + modification toasts (also covers live updates to shared `Store`/`StoreCategoryOrder` edits from §7/§8). |
| **4 — Offline & PWA** | Dexie local store (including the local-only store-selection state from §9), sync queue + conflict resolution, service worker, manifest/installability, offline E2E coverage. This phase is the MVP-complete milestone. |
| **5 — Item-store tagging, prices, folders, photos, export** | Item-to-store tagging + filtered "show only this store's items" view (on top of the `Store` entity from Phase 2), price/budget tracking, list folders, item photos (local filesystem storage), badge counts/exclusion, email export. |
| **6 — Polish** | Passcode lock, premium-equivalent themes, personalized autocomplete, performance/accessibility hardening pass. |

No calendar dates are set here since team size/velocity aren't yet known — phases are ordered by dependency, not duration.

---

## 15. Assumptions & Open Questions

**Resolved:**
1. **Hosting target** — Docker on Unraid, packaged in a LinuxServer.io-style single-container image with `PUID`/`PGID` support (see §5 and `docker/unraid-template.xml`).
2. **Frontend build** — SvelteKit with `adapter-static`, served by AdonisJS from the same process/container.
3. **Auth method** — email+password only for v1. No OAuth/social login in MVP; nothing in the `User` schema needs to reserve space for it since adding a provider later is an additive migration.
4. **Monetization** — no premium tier, ever. Every feature in the §3 decision matrix is either shipped free or deferred/out-of-scope on engineering merit, not gated. `User`/`List` schemas carry no tier/plan field, now or later.
5. **Email delivery provider** — **SMTP2GO**, for both Phase 5 email export and Phase 3 invite-by-email. Adonis's `mail` config will use the SMTP transport pointed at SMTP2GO; API key/credentials supplied via environment variables (`SMTP2GO_*`) at deploy time, not committed.
6. **Container registry** — GHCR (`ghcr.io/brianramseyau/everylist`), per `docker/unraid-template.xml`'s `Repository` field.

No open questions remain blocking Phase 0.

---

*Next step after this plan is approved: Phase 0 — repo scaffold.*
