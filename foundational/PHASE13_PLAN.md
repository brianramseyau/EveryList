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

### 1. Make the API/realtime base URL configurable (prerequisite for everything else) — **done**

- `apps/web/src/lib/api/base-url.ts` (new): `apiBaseUrl()`, empty string for same-origin web/PWA builds (today's behavior, unchanged) or an absolute URL injected at build time for the native build. Shared by `client.ts` and `realtime.ts` rather than living on `client.ts` itself, so importing it doesn't pull `client.ts`'s other dependencies (`token.ts`, `ApiError`) into `realtime.ts`.
- `apps/web/src/lib/api/client.ts`: `apiFetch` now prefixes its request path with `apiBaseUrl()` instead of calling `fetch(path, ...)` directly against a bare relative path.
- `apps/web/src/lib/realtime.ts`: same source of truth drives `Transmit`'s `baseUrl` (`apiBaseUrl() || window.location.origin`) instead of hard-coding `window.location.origin`.
- Source the value via `import.meta.env.VITE_API_BASE_URL` — **not** `PUBLIC_API_BASE_URL`/SvelteKit's `$env/static/public` as originally planned. `$env/static/public` throws a hard build error for a named import with no matching env var, which would break every dev/CI/Docker build that never sets it (the default, required-unaffected case) — an unacceptable regression, discovered while implementing. `VITE_API_BASE_URL` is Vite's own always-safe (`undefined` when unset, no throw) mechanism, and matches the existing `VITE_API_PROXY_TARGET` convention already used in `vite.config.ts`. Defaults to `''` via `?? ''`, so the existing web/PWA/Docker build is byte-for-byte unaffected. The Capacitor build supplies it via a `.env` consumed at `pnpm --filter web build` time before `npx cap sync`.
- Updated the AdonisJS API's CORS config (`apps/api/config/cors.ts`): production `origin` is `['capacitor://localhost', 'https://localhost']` (was `[]` — the PWA is same-origin and never needed a CORS allowlist entry, so there was nothing to preserve "in addition to").

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

### 5. Close the remaining online-only mutations — **done**

Phase 5 (`foundational/PLAN.md`, Phase 5 status note) shipped offline-first writes for per-row create/update/delete, but explicitly left three call sites online-only because they didn't fit the single-row temp-id/`expectedVersion` model `offlineCreate`/`offlineMutate` (`apps/web/src/lib/offline/sync-engine.ts`) were built around: `reorderCategories`, `reorderStoreCategories`, and `attachStore`'s by-id path plus `addFavoriteToList`.

Implemented as designed, with two discovered refinements to the original plan:

- `QueuedMutation.op` (`apps/web/src/lib/offline/db.ts`) gained `'reorder'` and `'attach'` variants. Reorder applies the new `sortOrder` to every affected local Dexie row immediately, queues one mutation via a new `offlineReorder` helper (`sync-engine.ts`, parallel to `offlineCreate`/`offlineMutate`), and marks every touched row dirty (`isRowDirty()` extended for the compound-keyed `storeCategoryOrders` table). Attach reuses `offlineCreate` outright (`op?: 'create' | 'attach'`, defaulting to `'create'`) rather than a separate helper — the mechanics are identical, `'attach'` exists purely so the sync-status page can describe it accurately instead of mislabeling it "Create".
- **No conflict-handling path was added for reorder/attach, by design, not oversight**: the original plan expected 409s might occur ("replayed after another device already changed the same order"), but the actual reorder/attach endpoints (`categories_controller.ts`'s `reorder`, `stores_controller.ts`'s `reorderCategories`, the attach-by-id and add-to-list POSTs) never call `hasVersionConflict` — they bump versions or create rows unconditionally, with no `expectedVersion` check. A 409 is structurally impossible from these endpoints today, so `offlineReorder` queues with `expectedVersion: null` and `flush.ts`'s new `replayReorder` has no conflict branch. Redesigning those endpoints to support optimistic-concurrency checking on a bulk payload would be a real backend change outside this plan's scope.
- `attachStore`'s by-id path has no live UI call site today (only `stores.spec.ts` exercises it directly) — its offline placeholder is exactly as best-effort as the original plan described, with no visible-regression risk either way.
- Out of scope, deliberately: making `fetchCategories`/`fetchStoreCategoryOrder` merge locally-dirty rows on read (mirroring the `fetchItems` fix in the `2026-08-21` "offline sync DOM visibility" commit) — that would keep an offline reorder visible across a page navigation/reload during the offline window, but wasn't part of this section's ask, which was the write-side queue/dirty-flag/self-mutation-suppression mechanics. The calling components' own optimistic array updates (`categories/+page.svelte`, `stores/[storeId]/+page.svelte`) already keep the reorder visible for the in-memory session.

### 6. Settings sync-status page + banner — **done, superseded by Phase 14**

`foundational/PHASE14_PLAN.md` shipped this in full, ahead of this phase: `SyncStatusBanner.svelte`/`SyncToast.svelte` were deleted, and `apps/web/src/routes/settings/sync/+page.svelte` (linked from Settings, per `apps/web/src/routes/settings/+page.svelte`) now shows connection status, last successful sync time, and a per-item queued/failed list with "Retry now" — backed by `apps/web/src/lib/offline/connectivity.svelte.ts` (a real `/api/v1/ping` reachability probe, not just `navigator.onLine`) and a top-of-app `SyncStatusIcon.svelte` cloud-disconnected indicator replacing the old banner. Verified present in the codebase as of this review (2026-08-21) — no further work needed here; this phase's remaining sections (offline reorder/attach, native shell, CI) build on top of that connectivity/sync-status layer rather than creating it.

### 7. CI: signed build artifacts (this phase's exit criterion)

- New GitHub Actions workflow (alongside the existing `docker-publish.yml` pattern in `.github/workflows/`) that builds the web bundle with the native `PUBLIC_API_BASE_URL`, runs `cap sync`, then builds:
  - **Android:** an APK (and/or AAB) via Gradle, signed using a keystore supplied through repo secrets — sideload-ready today, AAB format also keeps a future Play Store submission unblocked.
  - **iOS:** an unsigned/simulator build at minimum; a signed device/TestFlight-capable build additionally requires an Apple Developer Program enrollment and certificates/provisioning profiles as CI secrets (account-level setup, outside this plan's engineering scope).
- Artifacts uploaded as workflow build artifacts (not published to a store, matching the "sideload for now" decision) so a signed build is always one Actions run away without needing a local machine.

## Execution order

The sections above are scoped, not sequenced — here's the actual build order and why, reviewed 2026-08-21:

1. **§1 (base URL + CORS) — done.** The acknowledged load-bearing decision — §2/§3/§4/§7 all assume it's done, since nothing native can reach the real API or pass CORS without it. Small and mechanical; fully unit-testable without any native tooling.
2. **§5 (offline reorder/attach/favorite-add gaps) — done.** No dependency on Capacitor — touches only the sync engine (`db.ts`, `sync-engine.ts`, `sync-queue.ts`, `flush.ts`, `categories.ts`/`stores.ts`/`favorites.ts`) and is testable today via the existing Vitest/Playwright suite. Sequenced early (rather than right before §4) so the native app is offline-complete from the point it exists, not patched right before the device pass. It does need to be *done* before §4, since §4's manual verification re-tests these paths on-device.
3. **§2 (add Capacitor).** Needs §1 done first — no point wiring the native shell before it has anywhere real to point.
4. **§3 (PWA/WebView reconciliation — SW gating, badge, SSE reconnect).** Needs §2's native projects to exist, since it's reconciling PWA behavior *against* the Capacitor WebView.
5. **§4 (local build + manual device verification).** The integration checkpoint for §1–§3 and §5 together. **Needs the maintainer directly** — Xcode/iOS Simulator and Android Studio/emulator require a local GUI that isn't drivable from an agent session; native projects/configs/CLI builds can be prepared ahead of time, but the simulator/device walkthrough itself is a manual handoff.
6. **§7 (CI signed builds).** Automates a build recipe, so it needs a working, manually-verified local build (§4) to codify first. **Needs secrets/account setup from the maintainer** (Android signing keystore; optionally an Apple Developer Program enrollment for a signed iOS build) — the workflow can be wired to consume them, but a legitimate signing identity can't be generated on its own.

Open decisions to pin down at the relevant stage (not blocking the order above): the bundle ID for `capacitor.config.ts` (placeholder so far: `au.brianramsey.everylist`, confirm before §2), the real `VITE_API_BASE_URL` for native builds (needed at §2/§4), and whether an Android signing keystore already exists or needs generating (needed at §7).

## Files to add/change (representative, not exhaustive)

- `apps/web/src/lib/api/base-url.ts` (new), `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/realtime.ts` — configurable base URL. **Done.**
- `apps/web/capacitor.config.ts` — new, with `ios.path`/`android.path` pointed out to the top-level `apps/` siblings.
- `apps/ios/`, `apps/android/` — new, generated + committed (native projects, top-level siblings of `apps/web`/`apps/api`, not nested under `apps/web`).
- `apps/web/package.json` — new Capacitor dependencies + `cap:*` scripts.
- `apps/web/.env.native` (or similar) — `VITE_API_BASE_URL` for native builds.
- `apps/api/config/cors.ts` — allow Capacitor origins. **Done.**
- `apps/web/src/lib/pwa/badge.ts` — native badge branch.
- `apps/web/src/lib/offline/db.ts` — `QueuedMutation.op` gains `'reorder'`/`'attach'`; `isRowDirty()` extended. **Done.**
- `apps/web/src/lib/offline/sync-engine.ts` — new `offlineReorder` helper for bulk reorders; `offlineCreate` gained an `op?: 'create' | 'attach'` option, reused for attach. **Done.**
- `apps/web/src/lib/offline/flush.ts` — new `replayReorder` for queued reorder replay; no conflict-handling addition needed (see §5 — the endpoints involved can't 409). **Done.**
- `apps/web/src/lib/api/categories.ts`, `apps/web/src/lib/api/stores.ts`, `apps/web/src/lib/api/favorites.ts` — route the three currently-online-only calls through the offline queue. **Done.**
- `apps/web/src/routes/settings/sync/+page.svelte` — `describeMutation`'s op-to-verb mapping extended for `reorder`/`attach`. **Done.**
- `.github/workflows/native-build.yml` — new.

## Verification

- `pnpm --filter web build && pnpm --filter web check` stays clean (typecheck/lint unaffected by the base-URL change).
- Existing Vitest suite for `apps/web` stays at the 100% coverage gate — the base-URL resolution logic itself needs unit coverage (default empty-string/same-origin path and the injected-absolute-URL path).
- Manual device verification on both platforms: login (token storage/persistence across app restarts), list CRUD against the real HTTPS API, offline mode (airplane mode → add/edit items → reconnect → confirm sync, reusing the existing Phase 5 offline behavior), and SSE reconnect after backgrounding the app for a minute and returning to it.
- Offline mode additionally covers the newly-closed gaps: reorder categories/store aisle order while offline and confirm the new order survives a reconnect; add a favorite to a list and attach an existing store while offline and confirm both resolve correctly on flush.
- Settings sync-status view (already shipped, Phase 14): confirm the newly-queued reorder/attach mutations from this phase show up correctly in `/settings/sync`'s queued-item list alongside the existing create/update/delete entries.
- CI: the new workflow run produces a downloadable Android APK/AAB artifact and an iOS build artifact.
