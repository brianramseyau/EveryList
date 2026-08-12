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
| Category customization (reorder/rename/create) | Free | **MVP** | Needed for auto-categorization to be trustworthy. |
| Favorites (master list) | Free | **MVP** | Core loop for repeat shopping. |
| Recent items (restore checked/deleted) | Free | **MVP** | Cheap with soft-delete, high value. |
| Quantities & notes | Free | **MVP** | Core item fields. |
| Copy & paste import | Free | **MVP** | Simple parser, high leverage. |
| Print & email export | Free | **MVP** (print only, email deferred) | Browser print stylesheet is trivial; outbound email requires transactional email service — Phase 5. |
| Uncompleted item badge count | Free | **Phase 5** | Web Badging API, partial browser support; app-shell first. |
| Home screen install (PWA) | Free (native widget) | **MVP** (install/manifest), widgets **out of scope** | PWA installability ≠ native home-screen widgets; widgets need a native shell (Capacitor), not planned. |
| Voice Assistant (Siri/Alexa) | Free | **Out of scope** | Requires native intents/skills; not achievable from a PWA. Revisit only if a Capacitor wrapper is built later. |
| Online grocery fulfillment (Instacart, etc.) | Free | **Out of scope** | Requires commercial partner API agreements; not a lean-engineering decision. |
| Item photos | Premium | **Phase 5** | Needs object storage; deferred, not architecturally hard. |
| Stores & store filtering | Premium | **Phase 5** | Adds `Store` entity + item tagging + filtered view. |
| Prices & budget tracking | Premium | **Phase 5** | Adds price field + running total; depends on Stores. |
| Apple Watch app | Premium | **Out of scope** | Native-only platform. |
| List folders | Premium | **Phase 5** | Straightforward grouping entity. |
| Location-based reminders | Premium | **Out of scope (for now)** | Web Geofencing isn't reliably available; approximating with plain Geolocation + push is fragile. Revisit if PWA background geolocation matures. |
| Passcode lock | Premium | **Phase 6** | Client-side PIN gate (WebAuthn or local PIN) on sensitive lists. |
| Premium themes | Premium | **Phase 6** | Flowbite theming makes this cheap; light/dark mode ships in MVP, extra themes later. |
| Desktop & web access | Premium | **Already satisfied** | The product *is* the web app — no separate native client needed. |
| Badge exclusion | Premium | **Phase 5** | Ships alongside badge counts. |

---

## 4. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node.js 24 (LTS)** | Enforced via `engines` + `.nvmrc` + CI matrix. |
| Language | **TypeScript** (strict mode) everywhere | `strict: true`, `noUncheckedIndexedAccess: true`, shared `tsconfig.base.json`. |
| Frontend framework | **SvelteKit** (Svelte 5) | File-based routing, SSR-capable but deployed as a PWA app-shell; `adapter-node` or `adapter-static` decision in §5. |
| UI kit | **Flowbite Svelte** (+ Tailwind CSS) | Accessible components, light/dark theming out of the box. |
| PWA tooling | **vite-plugin-pwa** (Workbox) | Manifest, service worker, precache + runtime caching strategies. |
| Offline store | **Dexie.js** (IndexedDB wrapper) | Local-first source of truth; sync queue built on top. |
| Backend framework | **AdonisJS 6** | Native TypeScript, Lucid ORM, VineJS validation, built-in Auth, Transmit (SSE) for real-time. |
| Database | **PostgreSQL 16** | JSONB for flexible metadata (e.g. import parsing artifacts), solid concurrency. |
| Cache / pub-sub | **Redis** | Transmit broadcast backing store, rate limiting, session/token storage. |
| Object storage | **S3-compatible (e.g. Cloudflare R2)** | Item photos, Phase 5. Abstracted behind a storage interface so provider is swappable. |
| Real-time transport | **Adonis Transmit (SSE)** | Simpler than WebSockets for one-directional server→client push; sufficient for list sync events. |
| Validation | **VineJS** (backend), shared Zod-free — DTOs generated from VineJS schemas shared via `packages/shared` | Single source of truth for request/response shapes. |
| Backend testing | **Japa** (Adonis's native runner) + **c8** for coverage | |
| Frontend testing | **Vitest** + **@testing-library/svelte** (unit/integration), **Playwright** (E2E) | |
| Package management | **pnpm** workspaces | Monorepo, single lockfile. |
| CI | **GitHub Actions** | Lint → typecheck → test+coverage gate → build → E2E smoke. |

---

## 5. System Architecture

```
                     ┌─────────────────────────┐
                     │   Browser / Installed PWA │
                     │  SvelteKit + Flowbite UI  │
                     │  Service Worker (Workbox) │
                     │  IndexedDB (Dexie) local  │
                     │  store = source of truth  │
                     └────────────┬──────────────┘
                                  │ HTTPS (REST) + SSE (live updates)
                                  ▼
                     ┌─────────────────────────┐
                     │        AdonisJS API       │
                     │  Controllers / VineJS      │
                     │  validation / Lucid ORM    │
                     │  Transmit broadcast layer  │
                     └───────┬─────────┬─────────┘
                              │         │
                    ┌─────────▼──┐   ┌──▼─────────┐
                    │ PostgreSQL │   │   Redis    │
                    │ (system of │   │ (pub/sub,  │
                    │  record)   │   │ sessions,  │
                    └────────────┘   │ rate-limit)│
                                      └────────────┘
                     ┌─────────────────────────┐
                     │  S3-compatible storage    │  (Phase 5, item photos)
                     └─────────────────────────┘
```

**Deployment shape:** two deployable units — `apps/web` (SvelteKit, `adapter-node`, containerized) and `apps/api` (AdonisJS, containerized). Both ship as Docker images so the hosting target (Fly.io, Railway, a VPS, etc.) stays a deployment-time decision, not an architectural one. This is flagged as an open question in §15.

**Why SSE over WebSockets:** all real-time traffic in this app is server→client (list/item changed elsewhere). Client→server mutations go over normal REST calls that also drive the offline sync queue. SSE is simpler to scale, reconnect, and load-balance than WebSockets, and Transmit ships with Adonis natively.

---

## 6. Monorepo Layout

```
EveryList/
├── foundational/
│   └── PLAN.md
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
├── .github/workflows/
├── docker-compose.yml            # local Postgres + Redis + api + web
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
- **Category** — id, name, sortOrder, listId (nullable = global default), isDefault. Seeded with standard aisle categories (Produce, Dairy, Meat, Bakery, Frozen, Pantry, Household, Other); per-list overrides for reorder/rename/custom categories.
- **Item** — id, listId, name, quantity, notes, categoryId, checked, checkedAt, sortOrder, storeId (nullable, Phase 5), price (nullable, Phase 5), photoUrl (nullable, Phase 5), createdBy, timestamps + `deletedAt` (backs Recent Items recovery).
- **FavoriteItem** — id, userId, name, defaultCategoryId, defaultQuantity. The "master list" for one-tap rebuild.
- **Store** (Phase 5) — id, ownerId, name, color.
- **Folder** (Phase 5) — id, userId, name, color, sortOrder.
- **SyncEvent** — id, entityType, entityId, op (`create`/`update`/`delete`), version, updatedAt. Backs both the offline conflict check (client sends `lastKnownVersion`) and the Transmit broadcast payload.

**Conflict resolution:** last-write-wins per item, keyed on a monotonically increasing `version` column bumped server-side on every mutation. The client's offline queue attaches the last version it saw; the server accepts if the version matches or is newer than what it has recorded as synced from that client, otherwise flags a conflict the client resolves by taking the server's copy and re-applying the local diff as a new edit (no silent data loss, no CRDT complexity for v1).

---

## 8. API & Real-Time Design

- REST, versioned under `/api/v1/...`, resource-oriented (`/lists`, `/lists/:id/items`, `/lists/:id/members`, `/favorites`, `/categories`).
- All request/response bodies validated with VineJS; the inferred types are re-exported from `packages/shared` so the SvelteKit client is fully typed against the same contracts the backend enforces.
- Real-time: clients subscribe to `list/:id` Transmit channels on list open; every mutation broadcasts a `SyncEvent` to that channel so other connected members see updates within roughly a second, with an optional "list was modified" toast per the AnyList "modification alerts" behavior.
- Bulk import endpoint (`POST /lists/:id/items/import`) accepts raw pasted text, splits lines, and runs each line through the same auto-categorization pass as manual add.

---

## 9. Offline-First & PWA Strategy

- **Local-first writes:** all mutations write to Dexie (IndexedDB) immediately and render optimistically; a background sync queue drains to the API when online.
- **Service worker (Workbox via vite-plugin-pwa):** precache the app shell; runtime-cache GET requests with stale-while-revalidate; offline fallback route for full navigations.
- **Sync queue:** durable queue table in Dexie of pending mutations, retried with backoff, flushed on `online` events and periodically via the Background Sync API where supported, with a manual "retry sync" affordance as a fallback for browsers without it.
- **Installability:** web app manifest with icons/splash screens, `display: standalone`, theme color; install prompt surfaced contextually, not nagged.
- **Badge counts (Phase 5):** Web Badging API where available; degrades gracefully (in-app count only) where not.

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
- Functional tests (Japa `ApiClient`) hit real HTTP routes against a disposable test Postgres DB, wrapped in a transaction per test and rolled back.
- Coverage via `c8` wrapping `node ace test`; `.c8rc.json` sets `lines`, `branches`, `functions`, `statements` thresholds to 100 and `check-coverage: true`, run in CI as a hard gate.

**Frontend (`apps/web`):**
- Component/unit tests: Vitest + Testing Library (`jsdom`), covering every component, store, and utility, including the offline sync queue logic (using `fake-indexeddb` to simulate Dexie without a real browser).
- Coverage via Vitest's built-in `v8` provider with `coverage.thresholds` set to 100% across all four metrics, gated in CI.
- **E2E (Playwright):** critical journeys — create/share a list, add/check/import items, go offline → add items → reconnect → confirm sync, install prompt flow, accessibility smoke via `axe-core`. E2E runs against a real Dockerized backend and **is a required merge gate but is not folded into the 100% coverage number** — coverage measures unit/integration only; E2E measures user-facing correctness. This distinction is stated explicitly so "100% coverage" isn't overclaimed as "0 bugs."

---

## 12. CI/CD & Quality Gates

GitHub Actions pipeline (per PR):
1. Install (pnpm, cached) → lint (ESLint + Prettier check) → typecheck (`tsc --noEmit` in every workspace).
2. `apps/api` tests + coverage gate (against ephemeral Postgres/Redis service containers).
3. `apps/web` tests + coverage gate.
4. Build both apps.
5. Playwright E2E smoke against the built app + Dockerized API (docker-compose in CI).
6. Merge blocked on any failing step, including coverage falling under 100%.

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
| **0 — Foundations** | This plan; repo scaffold (pnpm workspaces, Docker Compose, CI skeleton, lint/format/typecheck config, shared `tsconfig`); empty Adonis + SvelteKit apps wired together and deployable. |
| **1 — Auth & domain core** | User auth (register/login/refresh), `List`/`Category`/`Item` migrations + models, default category seeding. |
| **2 — List & item CRUD** | Full list/item management UI + API, quantities/notes, auto-categorization, category customization, favorites, recent-items recovery. |
| **3 — Sharing & real-time** | `ListMember` roles, invite/join flow, Transmit channels, live update UI + modification toasts. |
| **4 — Offline & PWA** | Dexie local store, sync queue + conflict resolution, service worker, manifest/installability, offline E2E coverage. This phase is the MVP-complete milestone. |
| **5 — Stores, prices, folders, photos, export** | Store entity + filtering, price/budget tracking, list folders, item photos (object storage), badge counts/exclusion, email export. |
| **6 — Polish** | Passcode lock, premium-equivalent themes, personalized autocomplete, performance/accessibility hardening pass. |

No calendar dates are set here since team size/velocity aren't yet known — phases are ordered by dependency, not duration.

---

## 15. Assumptions & Open Questions

These were decided with a reasonable default so the plan could be complete, but are worth confirming before Phase 0 work starts:

1. **Hosting target** — plan assumes containerized deployment (Docker) to a not-yet-chosen host (Fly.io/Railway/VPS/etc.). No target is baked into the architecture; confirm before writing deploy manifests.
2. **SvelteKit vs. plain Svelte+Vite SPA** — plan recommends SvelteKit for routing/SSR flexibility even though the app is deployed PWA-first; confirm this is acceptable versus a leaner SPA-only setup.
3. **Auth method** — plan assumes email+password only for v1 (no OAuth/social login). Confirm whether Google/Apple sign-in should be pulled into MVP.
4. **Monetization** — plan assumes **no** premium tier; everything is either shipped free or deferred/out-of-scope. Confirm this is the intent versus keeping a future paywall option open (which would affect the `List`/`User` schema now rather than later).
5. **Email delivery provider** (for Phase 5 email export + invite emails) — not yet chosen (e.g. Resend, Postmark, SES); needed before Phase 3 invite-by-email ships.

---

*Next step after this plan is approved: Phase 0 — repo scaffold.*
