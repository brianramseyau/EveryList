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
- **API reachability:** the server URL is **runtime-configurable, not baked into the build** — revised from the original plan (see §1). A self-hosted client app shouldn't hard-code one server's address into the binary; the app asks the user for their server's address on first launch instead, the same way Nextcloud/Audiobookshelf/Donetick's native apps do. One APK/IPA works against anyone's instance. No reverse-proxy or dynamic-DNS work needed here.
- **Build automation:** local Xcode/Android Studio builds are fine during development of this phase; a GitHub Actions workflow producing signed build artifacts is required as this phase's exit criterion, before it's considered done.

## Scope

### 1. Make the API/realtime base URL configurable (prerequisite for everything else) — **done**

Implemented in two passes — the first baked the URL in at build time via `VITE_API_BASE_URL`; the user then pushed back on hard-coding a server address into the binary at all (self-hosted apps like Nextcloud/Audiobookshelf/Donetick ask the user instead, at runtime, changeable without a rebuild), so the mechanism was replaced with a persisted, user-editable setting before any native build actually shipped. What's in the codebase now:

- `apps/web/src/lib/api/server-url.ts` (new): `getServerUrl()`/`setServerUrl()`/`clearServerUrl()`, `localStorage`-backed (mirrors `token.ts` exactly, including its SSR/no-`window` guard) under `everylist:serverUrl`. Empty string until the user sets one — same-origin web/PWA behavior is completely unchanged, since nothing on the web build ever calls `setServerUrl`.
- `apps/web/src/lib/api/base-url.ts` (new): `apiBaseUrl()` delegates to `getServerUrl()`. Kept as its own module (rather than living on `client.ts`) so importing it doesn't pull `client.ts`'s other dependencies (`token.ts`, `ApiError`) into `realtime.ts`.
- `apps/web/src/lib/api/client.ts`: `apiFetch` prefixes its request path with `apiBaseUrl()` instead of calling `fetch(path, ...)` directly against a bare relative path.
- `apps/web/src/lib/realtime.ts`: same source of truth drives `Transmit`'s `baseUrl` (`apiBaseUrl() || window.location.origin`) instead of hard-coding `window.location.origin`.
- `apps/web/src/lib/api/ping.ts`: `fetchPing()` gained an optional `baseUrl` param (defaulting to `apiBaseUrl()`) — it had the same same-origin assumption (predates the native work, from Phase 14) and would otherwise always ping the local Capacitor scheme and report the server permanently unavailable on native. The override also lets `/server-setup` test a candidate URL before saving it.
- `apps/web/src/routes/server-setup/+page.svelte` (new): a dedicated screen — server URL input, `new URL(...)`-based validation, pings the candidate via `fetchPing`, saves and continues to `/login` on success, or shows an inline "couldn't reach this server" warning with a non-blocking "Continue anyway" (a self-hosted server can be unreachable for reasons unrelated to a wrong URL — a cold container boot, a slow reverse proxy). Doubles as the "change server" screen (pre-fills from `getServerUrl()`).
- `apps/web/src/routes/+layout.svelte`: on mount, if `Capacitor.isNativePlatform()` and no server URL is configured and the current route isn't already `/server-setup`, redirects there — before login, since a fresh native install has no token *and* nowhere for a login request to go. Pulled forward the `@capacitor/core` dependency (not the rest of §2 — `cap add ios/android` etc. — just the one package) to make this check possible; `Capacitor.isNativePlatform()` is a pure JS check that's always `false` with zero native project scaffolding, so this is safe to have landed ahead of §2.
- `apps/web/src/routes/settings/+page.svelte`: a "Server" row, shown only when `Capacitor.isNativePlatform()`, displaying the current URL with a "Change" action (clears the token and server URL, returns to `/server-setup` — no confirm step, matching the existing "Log out" button's directness).
- Updated the AdonisJS API's CORS config (`apps/api/config/cors.ts`): production `origin` is `['capacitor://localhost', 'https://localhost']` (was `[]` — the PWA is same-origin and never needed a CORS allowlist entry, so there was nothing to preserve "in addition to"). Unaffected by the runtime-URL rework above — CORS is about the Capacitor app's own origin, not which server it's configured to call.

### 2. Add Capacitor to `apps/web` — **done**

- Added `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` as dependencies of `apps/web` (`@capacitor/core` already added in §1, for `Capacitor.isNativePlatform()`).
- `apps/web/capacitor.config.ts`: `appId: 'au.brianramsey.everylist'`, `appName: 'EveryList'`, `webDir: 'build'` (matches `adapter-static`'s default output dir), plus `ios.path`/`android.path` set to `../ios` and `../android` — matching this repo's existing top-level `apps/<platform>` separation (`apps/web`, `apps/api`) rather than nesting native projects inside `apps/web`.
- `npx cap add ios` / `npx cap add android` generated the native projects at `apps/ios/` and `apps/android/` per that path config — committed to the repo (each with Capacitor's own generated `.gitignore` excluding `Pods/`, `.gradle/`, `build/`, etc.), consistent with how `docker/` already commits deployment-shape config rather than treating it as generated/ignored output.
- `apps/web/assets/icon.svg` (copied from `branding/icon.svg`) + `@capacitor/assets` (dev dependency) generated the icon/splash set for both platforms — `pnpm --filter web run cap:assets` (background colors matched to the app's `--color-paper` light/dark tokens, `layout.css`). No new artwork needed, one generation pass; visually verified both platforms' launcher icon, adaptive-icon layers, and splash screen render correctly.
- `pnpm --filter web run cap:sync` (`build` + `cap sync`) added as the local sync loop; `cap:ios`/`cap:android` open each IDE. `sharp` (a `@capacitor/assets` dependency) added to `pnpm-workspace.yaml`'s `onlyBuiltDependencies`, matching the existing allowlist pattern there.

### 3. Reconcile the PWA/offline layer with the Capacitor WebView — **done**

- The Workbox service worker registration in `apps/web/src/routes/+layout.svelte` is now gated behind `!Capacitor.isNativePlatform()` — skipped entirely on native rather than assumed to no-op harmlessly, since service-worker support in Capacitor's WebView (a local-scheme/`WebViewAssetLoader`-served origin, not a real network layer) is unreliable in practice on both platforms. `initInstallPrompt()` needed no change: it only listens for `beforeinstallprompt`/`appinstalled`, which simply never fire in a Capacitor WebView, so it already degrades to a no-op there.
- Dexie/IndexedDB confirmed unchanged, per plan — no code touched here.
- `apps/web/src/lib/realtime.ts`: `subscribeToList` now registers an `@capacitor/app` `appStateChange` listener when `Capacitor.isNativePlatform()`. On resume (`isActive: true`), it tears down and recreates the subscription against the shared Transmit client, rather than relying on the browser's implicit EventSource retry timing surviving an OS-level socket teardown during backgrounding. Encapsulated entirely inside `subscribeToList` (its only call site, `lists/[id]/+page.svelte`, needed no changes) rather than pushed onto callers.
- `apps/web/src/lib/pwa/badge.ts`: `@capawesome/capacitor-badge` — not `@capacitor/badge`, which doesn't exist as a package; the actual community-maintained plugin under the Capawesome org — provides the native counterpart when `Capacitor.isNativePlatform()`, requesting notification permission lazily on first badge-set rather than at launch. Falls back to the existing Web Badging API path otherwise, same feature-detection pattern as `beforeinstallprompt`.

### 4. Native build tooling & local verification

- Local prerequisites: Xcode + iOS Simulator for iOS builds, Android Studio + JDK for Android builds/emulator — dev-time-only, no store account requirements.
- Local build loop: `pnpm --filter web build` → `npx cap sync` → open/run via Xcode (`npx cap open ios`) and Android Studio (`npx cap open android`). No build-time server URL to set (§1) — the app prompts for one via `/server-setup` on first launch.

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

- New GitHub Actions workflow (alongside the existing `docker-publish.yml` pattern in `.github/workflows/`) that builds the web bundle (no server URL to inject — §1 made that runtime-configurable, so one build serves every self-hosted instance), runs `cap sync`, then builds:
  - **Android:** an APK (and/or AAB) via Gradle, signed using a keystore supplied through repo secrets — sideload-ready today, AAB format also keeps a future Play Store submission unblocked.
  - **iOS:** an unsigned/simulator build at minimum; a signed device/TestFlight-capable build additionally requires an Apple Developer Program enrollment and certificates/provisioning profiles as CI secrets (account-level setup, outside this plan's engineering scope).
- Artifacts uploaded as workflow build artifacts (not published to a store, matching the "sideload for now" decision) so a signed build is always one Actions run away without needing a local machine.

## Execution order

The sections above are scoped, not sequenced — here's the actual build order and why, reviewed 2026-08-21:

1. **§1 (base URL + CORS) — done.** The acknowledged load-bearing decision — §2/§3/§4/§7 all assume it's done, since nothing native can reach the real API or pass CORS without it. Small and mechanical; fully unit-testable without any native tooling.
2. **§5 (offline reorder/attach/favorite-add gaps) — done.** No dependency on Capacitor — touches only the sync engine (`db.ts`, `sync-engine.ts`, `sync-queue.ts`, `flush.ts`, `categories.ts`/`stores.ts`/`favorites.ts`) and is testable today via the existing Vitest/Playwright suite. Sequenced early (rather than right before §4) so the native app is offline-complete from the point it exists, not patched right before the device pass. It does need to be *done* before §4, since §4's manual verification re-tests these paths on-device.
3. **§2 (add Capacitor) — done.** Needed §1 done first — no point wiring the native shell before it has anywhere real to point.
4. **§3 (PWA/WebView reconciliation — SW gating, badge, SSE reconnect) — done.** Needed §2's native projects to exist, since it's reconciling PWA behavior *against* the Capacitor WebView.
5. **§4 (local build + manual device verification).** The integration checkpoint for §1–§3 and §5 together. **Needs the maintainer directly** — Xcode/iOS Simulator and Android Studio/emulator require a local GUI that isn't drivable from an agent session; native projects/configs/CLI builds can be prepared ahead of time, but the simulator/device walkthrough itself is a manual handoff.
6. **§7 (CI signed builds).** Automates a build recipe, so it needs a working, manually-verified local build (§4) to codify first. **Needs secrets/account setup from the maintainer** (Android signing keystore; optionally an Apple Developer Program enrollment for a signed iOS build) — the workflow can be wired to consume them, but a legitimate signing identity can't be generated on its own.

Open decisions to pin down at the relevant stage (not blocking the order above): the bundle ID for `capacitor.config.ts` — **confirmed: `au.brianramsey.everylist`** — and whether an Android signing keystore already exists or needs generating (needed at §7). (The native build's server address is no longer a build-time decision — see §1 — so there's nothing to pin down for that at §2/§4; a fresh install just goes through `/server-setup`.)

## Files to add/change (representative, not exhaustive)

- `apps/web/src/lib/api/server-url.ts` (new), `apps/web/src/lib/api/base-url.ts` (new), `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/realtime.ts`, `apps/web/src/lib/api/ping.ts`, `apps/web/src/routes/server-setup/+page.svelte` (new), `apps/web/src/routes/+layout.svelte`, `apps/web/src/routes/settings/+page.svelte` — runtime-configurable server URL. **Done.**
- `apps/web/capacitor.config.ts` — new, with `ios.path`/`android.path` pointed out to the top-level `apps/` siblings. **Done.**
- `apps/ios/`, `apps/android/` — new, generated + committed (native projects, top-level siblings of `apps/web`/`apps/api`, not nested under `apps/web`). **Done.**
- `apps/web/assets/icon.svg` — new (copy of `branding/icon.svg`, the `@capacitor/assets` generation source). **Done.**
- `apps/web/package.json` — `@capacitor/cli`/`ios`/`android` + `cap:sync`/`cap:assets`/`cap:ios`/`cap:android` scripts. **Done.**
- `pnpm-workspace.yaml` — `sharp` added to `onlyBuiltDependencies`. **Done.**
- `apps/api/config/cors.ts` — allow Capacitor origins. **Done.**
- `apps/web/src/lib/pwa/badge.ts` — native badge branch (`@capawesome/capacitor-badge`). **Done.**
- `apps/web/src/lib/realtime.ts` — `appStateChange`-driven resubscribe on native. **Done.**
- `apps/web/src/routes/+layout.svelte` — service worker registration gated off on native. **Done.**
- `apps/web/package.json` — `@capacitor/app`, `@capawesome/capacitor-badge` added. **Done.**
- `apps/web/src/lib/offline/db.ts` — `QueuedMutation.op` gains `'reorder'`/`'attach'`; `isRowDirty()` extended. **Done.**
- `apps/web/src/lib/offline/sync-engine.ts` — new `offlineReorder` helper for bulk reorders; `offlineCreate` gained an `op?: 'create' | 'attach'` option, reused for attach. **Done.**
- `apps/web/src/lib/offline/flush.ts` — new `replayReorder` for queued reorder replay; no conflict-handling addition needed (see §5 — the endpoints involved can't 409). **Done.**
- `apps/web/src/lib/api/categories.ts`, `apps/web/src/lib/api/stores.ts`, `apps/web/src/lib/api/favorites.ts` — route the three currently-online-only calls through the offline queue. **Done.**
- `apps/web/src/routes/settings/sync/+page.svelte` — `describeMutation`'s op-to-verb mapping extended for `reorder`/`attach`. **Done.**
- `.github/workflows/native-build.yml` — new.

## Verification

- `pnpm --filter web build && pnpm --filter web check` stays clean (typecheck/lint unaffected by the server-URL change).
- Existing Vitest suite for `apps/web` stays at the 100% coverage gate — `server-url.ts`/`base-url.ts`/`ping.ts`'s runtime resolution logic and `/server-setup`'s validate/ping/save flow all need unit coverage.
- Manual device verification on both platforms: fresh install lands on `/server-setup` (not `/login`) before any server is configured; entering a real URL pings it and proceeds to login; entering an unreachable one shows the warning and "Continue anyway" still works; Settings → Server → Change clears the session and returns to `/server-setup`. Then: login (token storage/persistence across app restarts), list CRUD against the real HTTPS API, offline mode (airplane mode → add/edit items → reconnect → confirm sync, reusing the existing Phase 5 offline behavior), and SSE reconnect after backgrounding the app for a minute and returning to it.
- Offline mode additionally covers the newly-closed gaps: reorder categories/store aisle order while offline and confirm the new order survives a reconnect; add a favorite to a list and attach an existing store while offline and confirm both resolve correctly on flush.
- Settings sync-status view (already shipped, Phase 14): confirm the newly-queued reorder/attach mutations from this phase show up correctly in `/settings/sync`'s queued-item list alongside the existing create/update/delete entries.
- CI: the new workflow run produces a downloadable Android APK/AAB artifact and an iOS build artifact.
