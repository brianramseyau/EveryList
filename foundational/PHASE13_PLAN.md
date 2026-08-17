# Phase 13 — Native App Shell (Capacitor, iOS + Android)

## Context

EveryList is a self-hosted, offline-first list app (PWA, SvelteKit + AdonisJS single-container deploy — see `foundational/PLAN.md`). Phases 0–12 are complete; the app is a fully static SPA (`adapter-static`, `fallback: '200.html'`) already served installable as a PWA. This phase wraps that same frontend as real native iOS/Android apps, without duplicating app logic.

The codebase is a favorable base for wrapping with **Capacitor**:
- Fully static SPA output (no SSR) — Capacitor just needs to load the build.
- Token-based auth (`localStorage`, `Authorization: Bearer`) — no cookie-jar/WebView cookie complications.
- Already offline-first: Dexie/IndexedDB local store, Workbox service worker, PWA manifest.
- The self-hosted API already has a public HTTPS endpoint — no reverse-proxy/remote-access work needed as a prerequisite.

**The one real technical gap:** both `apps/web/src/lib/api/client.ts` (`apiFetch`, using bare relative `fetch(path, ...)`) and `apps/web/src/lib/realtime.ts` (`Transmit({ baseUrl: window.location.origin })`) assume same-origin deployment — true today because AdonisJS serves the API and the static build from one origin. Inside a Capacitor WebView, `window.location.origin` is a local scheme (`capacitor://localhost` on iOS, `https://localhost` on Android), not the real server — so both must become configurable to point at an absolute API URL when running natively, while continuing to work unmodified as a same-origin PWA/browser build. This is the load-bearing design decision the rest of the phase depends on.

## Locked decisions

- **Platforms:** iOS and Android together in this phase, not staged.
- **Distribution:** sideload/personal-use builds for now (no App Store/Play Store listing work in this phase) — but the technical setup (bundle IDs, versioning, signing config shape) should not foreclose a future store submission.
- **API reachability:** the production API already has a public HTTPS endpoint; the native build points at it directly via a build-time env var. No reverse-proxy or dynamic-DNS work needed here.
- **Build automation:** local Xcode/Android Studio builds are fine during development of this phase; a GitHub Actions workflow producing signed build artifacts is required as this phase's exit criterion, before it's considered done.

## Scope

### 1. Make the API/realtime base URL configurable (prerequisite for everything else)

- `apps/web/src/lib/api/client.ts`: introduce a resolved `API_BASE_URL` (empty string for same-origin web/PWA builds — today's behavior, unchanged — or an absolute URL injected at build time for the native build) and prefix `apiFetch`'s request path with it instead of calling `fetch(path, ...)` directly against a bare relative path.
- `apps/web/src/lib/realtime.ts`: same source of truth drives `Transmit`'s `baseUrl` instead of hard-coding `window.location.origin`.
- Source the value via a Vite env var (`PUBLIC_API_BASE_URL`, SvelteKit's `$env/static/public` convention), defaulted to `''` so the existing web/PWA/Docker build is byte-for-byte unaffected when the var is unset. The Capacitor build supplies it via a `.env` consumed at `pnpm --filter web build` time before `npx cap sync`.
- Update the AdonisJS API's CORS config (`apps/api/config/cors.ts`) to allow the Capacitor origins (`capacitor://localhost`, `https://localhost` for Android) in addition to whatever's already allowed for the PWA.

### 2. Add Capacitor to `apps/web`

- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` as dependencies of `apps/web`.
- `apps/web/capacitor.config.ts`: `appId` (reverse-DNS, e.g. `au.brianramsey.everylist`), `appName`, `webDir` pointing at the static build output directory, plus `ios.path`/`android.path` set to `../ios` and `../android` — matching this repo's existing top-level `apps/<platform>` separation (`apps/web`, `apps/api`) rather than nesting native projects inside `apps/web`.
- `npx cap add ios` / `npx cap add android` (run from `apps/web`, where `capacitor.config.ts` lives) generate the native projects at `apps/ios/` and `apps/android/` per that path config — committed to the repo, consistent with how `docker/` already commits deployment-shape config rather than treating it as generated/ignored output.
- `@capacitor/assets` (dev dependency) to generate the icon/splash set for both platforms from the existing `branding/icon.svg` source (already used for the PWA manifest per §9 of the foundational plan) — no new artwork needed, one generation pass.

### 3. Reconcile the PWA/offline layer with the Capacitor WebView

- The Workbox service worker (`vite-plugin-pwa`/`@vite-pwa/sveltekit`) is meaningful for the browser/PWA build but not for Capacitor's local-scheme WebView; confirm it no-ops harmlessly there (or gate its registration behind a `Capacitor.isNativePlatform()` check in the SW-registration code path if it doesn't) so it isn't fighting Capacitor for control of asset loading.
- Dexie/IndexedDB (the actual offline source of truth per §9/§7 of the foundational plan) works unchanged inside a Capacitor WebView — no changes needed there, this is the layer doing the real work either way.
- `@capacitor/app` plugin: listen for `appStateChange` and re-subscribe/reconnect the Transmit SSE client (`apps/web/src/lib/realtime.ts`) on foreground, since iOS/Android suspend background network activity and a stale SSE connection won't silently recover on its own.
- `navigator.setAppBadge` (existing `apps/web/src/lib/pwa/badge.ts` per Phase 6) gets a native counterpart via `@capacitor/badge` (or equivalent) when `Capacitor.isNativePlatform()`, falling back to the existing Web Badging API path otherwise — same feature-detection pattern already used for `beforeinstallprompt`.

### 4. Native build tooling & local verification

- Local prerequisites: Xcode + iOS Simulator for iOS builds, Android Studio + JDK for Android builds/emulator — dev-time-only, no store account requirements.
- Local build loop: `pnpm --filter web build` (with `PUBLIC_API_BASE_URL` set) → `npx cap sync` → open/run via Xcode (`npx cap open ios`) and Android Studio (`npx cap open android`).

### 5. Close the remaining online-only mutations

Phase 5 (`foundational/PLAN.md`, Phase 5 status note) shipped offline-first writes for per-row create/update/delete, but explicitly left three call sites online-only because they didn't fit the single-row temp-id/`expectedVersion` model `offlineCreate`/`offlineMutate` (`apps/web/src/lib/offline/sync-engine.ts`) were built around:
- `reorderCategories` (`apps/web/src/lib/api/categories.ts:86`) — bulk reorder, one request touching every category row.
- `reorderStoreCategories` (`apps/web/src/lib/api/stores.ts:73`) — same shape, for a store's aisle order.
- `attachStore`'s by-id path and `addFavoriteToList` (`apps/web/src/lib/api/favorites.ts` ~line 102) — join-table operations where the server computes the resulting row/sort order, so there's nothing to optimistically construct client-side today.

A native app used standing in a store with no signal needs all of these to work offline too — reordering categories or grabbing a favorite mid-shop are exactly the moments connectivity is worst. This phase extends the sync-queue model rather than leaving them as a known gap:
- `QueuedMutation.op` (`apps/web/src/lib/offline/db.ts`) gains `'reorder'` and `'attach'` variants alongside the existing `create`/`update`/`delete`.
- Reorder: apply the new `sortOrder` to every affected local Dexie row immediately (optimistic), queue one mutation carrying the full `order` payload, and mark every touched row dirty (extending `isRowDirty()`, `apps/web/src/lib/offline/db.ts:108`) so an incoming realtime event for any of those rows doesn't clobber the optimistic order before the queued reorder flushes.
- Attach/join operations: since the server computes the resulting row, the optimistic local row is a best-effort placeholder (e.g. a temp-id `Item`/`Store` row built from the favorite's/store's already-known local fields) that gets replaced by the server's authoritative response on flush — same reconciliation pattern `offlineCreate` already uses.
- `apps/web/src/lib/offline/flush.ts`'s existing generic replay (stored `url`/`payload`/`expectedVersion`, replayed as-is) needs no structural change — it already doesn't dispatch per entity type — but its 409/conflict handling gets exercised by a new case (a reorder or attach queued while offline, replayed after another device already changed the same order) and needs test coverage for that path specifically.

### 6. Settings sync-status page + banner

Today's `SyncStatusBanner.svelte` (root layout, Phase 5) shows a pending/failed count with a manual "Retry now" — good for an at-a-glance nudge, but it's transient and gives no history. This phase adds a persistent view, modeled on Bitwarden's vault sync status:
- New `Settings > Sync Status` section/row linking to a dedicated view (or an expandable section inline, matching the existing grouped-row Settings pattern from Phase 3 §16) showing: last successful sync timestamp, current pending-mutation count, current failed-mutation count, and a per-item list of what's queued (entity type + a human-readable description, e.g. "Update item: Milk") with its retry state.
- The existing root-layout banner stays as the lightweight, always-visible nudge (pending/failed count + "Retry now") — the Settings page is where you go to see *what* hasn't synced and *why*, not a replacement for the banner.
- "Recent syncs have not been successful" framing: track consecutive flush failures (already implicit in `flush.ts`'s retry/backoff loop) and surface a distinct warning state — not just "N pending" but "syncing has been failing for N attempts" — in both the banner and the Settings view, so a genuinely stuck queue (e.g. expired token, server unreachable) reads differently from normal offline-queued-briefly behavior.
- This is a frontend-only addition (`flush.ts` already tracks retry state via jittered exponential backoff; it needs to expose that state, e.g. via a small Svelte store, rather than keeping it as internal-only loop state) — no backend/schema changes.

### 7. CI: signed build artifacts (this phase's exit criterion)

- New GitHub Actions workflow (alongside the existing `docker-publish.yml` pattern in `.github/workflows/`) that builds the web bundle with the native `PUBLIC_API_BASE_URL`, runs `cap sync`, then builds:
  - **Android:** an APK (and/or AAB) via Gradle, signed using a keystore supplied through repo secrets — sideload-ready today, AAB format also keeps a future Play Store submission unblocked.
  - **iOS:** an unsigned/simulator build at minimum; a signed device/TestFlight-capable build additionally requires an Apple Developer Program enrollment and certificates/provisioning profiles as CI secrets (account-level setup, outside this plan's engineering scope).
- Artifacts uploaded as workflow build artifacts (not published to a store, matching the "sideload for now" decision) so a signed build is always one Actions run away without needing a local machine.

## Files to add/change (representative, not exhaustive)

- `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/realtime.ts` — configurable base URL.
- `apps/web/capacitor.config.ts` — new, with `ios.path`/`android.path` pointed out to the top-level `apps/` siblings.
- `apps/ios/`, `apps/android/` — new, generated + committed (native projects, top-level siblings of `apps/web`/`apps/api`, not nested under `apps/web`).
- `apps/web/package.json` — new Capacitor dependencies + `cap:*` scripts.
- `apps/web/.env.native` (or similar) — `PUBLIC_API_BASE_URL` for native builds.
- `apps/api/config/cors.ts` — allow Capacitor origins.
- `apps/web/src/lib/pwa/badge.ts` — native badge branch.
- `apps/web/src/lib/offline/db.ts` — `QueuedMutation.op` gains `'reorder'`/`'attach'`; `isRowDirty()` extended.
- `apps/web/src/lib/offline/sync-engine.ts` — new offline-aware helper(s) for bulk-reorder/attach mutations, alongside the existing `offlineCreate`/`offlineMutate`.
- `apps/web/src/lib/offline/flush.ts` — expose retry/failure-streak state for the sync-status UI; new conflict-handling test coverage for reorder/attach replay.
- `apps/web/src/lib/api/categories.ts`, `apps/web/src/lib/api/stores.ts`, `apps/web/src/lib/api/favorites.ts` — route the three currently-online-only calls through the offline queue.
- `apps/web/src/routes/settings/sync/+page.svelte` (or an inline expandable section on `settings/+page.svelte`) — new sync-status view.
- `apps/web/src/lib/components/SyncStatusBanner.svelte` — extended with a "failing for N attempts" warning state.
- `.github/workflows/native-build.yml` — new.

## Verification

- `pnpm --filter web build && pnpm --filter web check` stays clean (typecheck/lint unaffected by the base-URL change).
- Existing Vitest suite for `apps/web` stays at the 100% coverage gate — the base-URL resolution logic itself needs unit coverage (default empty-string/same-origin path and the injected-absolute-URL path).
- Manual device verification on both platforms: login (token storage/persistence across app restarts), list CRUD against the real HTTPS API, offline mode (airplane mode → add/edit items → reconnect → confirm sync, reusing the existing Phase 5 offline behavior), and SSE reconnect after backgrounding the app for a minute and returning to it.
- Offline mode additionally covers the newly-closed gaps: reorder categories/store aisle order while offline and confirm the new order survives a reconnect; add a favorite to a list and attach an existing store while offline and confirm both resolve correctly on flush.
- Settings sync-status view: confirm it reflects real pending/failed counts and last-sync time against a live queue (force a failure by pointing at an unreachable host, confirm the "failing for N attempts" state appears in both the banner and Settings, then restore connectivity and confirm it clears).
- CI: the new workflow run produces a downloadable Android APK/AAB artifact and an iOS build artifact.
