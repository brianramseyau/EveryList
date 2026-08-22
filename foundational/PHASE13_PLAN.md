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
- **Build automation:** local Xcode/Android Studio builds are fine during development of this phase; a GitHub Actions workflow producing signed build artifacts is required as this phase's exit criterion, before it's considered done. **Done — see §7.**

## Scope

### 1. Make the API/realtime base URL configurable (prerequisite for everything else) — **done**

Implemented in two passes — the first baked the URL in at build time via `VITE_API_BASE_URL`; the user then pushed back on hard-coding a server address into the binary at all (self-hosted apps like Nextcloud/Audiobookshelf/Donetick ask the user instead, at runtime, changeable without a rebuild), so the mechanism was replaced with a persisted, user-editable setting before any native build actually shipped. What's in the codebase now:

- `apps/web/src/lib/api/server-url.ts` (new): `getServerUrl()`/`setServerUrl()`/`clearServerUrl()`, `localStorage`-backed (mirrors `token.ts` exactly, including its SSR/no-`window` guard) under `everylist:serverUrl`. Empty string until the user sets one — same-origin web/PWA behavior is completely unchanged, since nothing on the web build ever calls `setServerUrl`.
- `apps/web/src/lib/api/base-url.ts` (new): `apiBaseUrl()` delegates to `getServerUrl()`. Kept as its own module (rather than living on `client.ts`) so importing it doesn't pull `client.ts`'s other dependencies (`token.ts`, `ApiError`) into `realtime.ts`.
- `apps/web/src/lib/api/client.ts`: `apiFetch` prefixes its request path with `apiBaseUrl()` instead of calling `fetch(path, ...)` directly against a bare relative path.
- `apps/web/src/lib/realtime.ts`: same source of truth drives `Transmit`'s `baseUrl` (`apiBaseUrl() || window.location.origin`) instead of hard-coding `window.location.origin`.
- `apps/web/src/lib/api/ping.ts`: `fetchPing()` gained an optional `baseUrl` param (defaulting to `apiBaseUrl()`) — it had the same same-origin assumption (predates the native work, from Phase 14) and would otherwise always ping the local Capacitor scheme and report the server permanently unavailable on native. The override also lets `/server-setup` test a candidate URL before saving it.
- `apps/web/src/routes/server-setup/+page.svelte` (new): a dedicated screen — server URL input, `new URL(...)`-based validation, pings the candidate via `fetchPing`, saves and continues to `/login` on success, or shows an inline "couldn't reach this server" warning with a non-blocking "Continue anyway" (a self-hosted server can be unreachable for reasons unrelated to a wrong URL — a cold container boot, a slow reverse proxy). Doubles as the "change server" screen (pre-fills from `getServerUrl()`).
- `apps/web/src/routes/+layout.svelte`: on mount, if `Capacitor.isNativePlatform()` and no server URL is configured and the current route isn't already `/server-setup`, redirects there — before login, since a fresh native install has no token _and_ nowhere for a login request to go. Pulled forward the `@capacitor/core` dependency (not the rest of §2 — `cap add ios/android` etc. — just the one package) to make this check possible; `Capacitor.isNativePlatform()` is a pure JS check that's always `false` with zero native project scaffolding, so this is safe to have landed ahead of §2.
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

### 4. Native build tooling & local verification — **in progress, needs the maintainer** (Android: dev-server connectivity + login confirmed working on-device; iOS: not yet verified, Xcode walkthrough below untested)

- Local prerequisites: Xcode + iOS Simulator for iOS builds, Android Studio + JDK for Android builds/emulator — dev-time-only, no store account requirements.
- Local build loop: `pnpm --filter web run cap:sync` (build + `cap sync`) → open/run via Xcode (`pnpm --filter web run cap:ios`) and Android Studio (`pnpm --filter web run cap:android`). No build-time server URL to set (§1) — the app prompts for one via `/server-setup` on first launch.

#### Android walkthrough (Android Studio)

1. **One-time setup wizard.** Open Android Studio. On first launch it runs the Setup Wizard —
   accept the defaults. This downloads the Android SDK, platform-tools, and a build-tools version
   to `~/Library/Android/sdk` (macOS default) and bundles its own JDK
   (`Android Studio.app/Contents/jbr`), so no separate system JDK install is needed.
2. **Confirm an SDK platform + emulator image are installed** — Setup Wizard installs these by
   default, but if skipped: **More Actions → SDK Manager** (or, with a project open,
   **Settings/Preferences → Languages & Frameworks → Android SDK**). Need at least one SDK
   Platform (e.g. Android 14 / API 34) under the "SDK Platforms" tab.
3. **Create a virtual device**: **Tools → Device Manager → Create device** — pick a phone profile
   and a system image (the wizard prompts to download the image if needed), finish.
4. **Build and sync**: from `apps/web`, `pnpm run cap:sync`.
5. **Open the project**: `pnpm run cap:android` (equivalent to `npx cap open android`) — opens
   `apps/android` in Android Studio.
6. **Run it**: let Gradle sync finish (first time downloads dependencies, can take a few minutes —
   watch the status bar), pick the AVD created in step 3 from the device dropdown, click **Run**
   (▶). Once the SDK exists, `apps/android`'s `./gradlew assembleDebug` also works standalone from
   the CLI (with `JAVA_HOME` pointed at Android Studio's bundled JDK) — useful for a build-only
   sanity check without opening the IDE or a device/emulator.

#### Pointing the emulator/simulator at a local dev API server

To exercise `/server-setup` against `pnpm --filter api dev` instead of production, host-side
gotchas otherwise make it look like the app "can't communicate" even with the right address —
and the right address itself differs by platform:

- **`apps/api/.env`'s `HOST` must be `0.0.0.0`, not `localhost`.** A server bound to
  `localhost`/`127.0.0.1` only accepts connections that originate on the same loopback interface;
  a connection arriving via the Android emulator's host-loopback alias (below) looks external to
  it and gets refused, regardless of the app having the right address. (Not needed for iOS — see
  below — but harmless to leave set either way.)

- **Android**: use `http://10.0.2.2:3334` — `10.0.2.2` is the emulator's alias for the host
  machine's `127.0.0.1`; plain `localhost` from inside the emulator means the emulator itself.
  Android also blocks cleartext (`http://`) traffic by default once `targetSdkVersion` is 28+
  (this project targets 36) — a debug-only network security config
  (`apps/android/app/src/debug/res/xml/network_security_config.xml` +
  `apps/android/app/src/debug/AndroidManifest.xml`) allow-lists cleartext to `10.0.2.2`. Gradle's
  debug source set merges it into debug builds only, so release builds (always `https://`) keep
  the default block. Requires a rebuild (not just `cap sync`) to pick up.
  That alone isn't sufficient, though: Capacitor serves the app's own pages over `https://localhost`
  (its default `androidScheme`), and Chromium's WebView separately enforces Mixed Content — blocking
  a plain `http://` `fetch()` from an `https://` page regardless of the OS-level cleartext policy
  above. `apps/android/app/src/main/java/.../MainActivity.java` sets
  `WebSettings.MIXED_CONTENT_ALWAYS_ALLOW` guarded by `BuildConfig.DEBUG`, so this only applies to
  debug builds (`BuildConfig.DEBUG` is generated per build variant, so one shared `MainActivity`
  can branch on it safely — no source-set duplicate-class issue like a `src/debug/java` override
  would hit). Referencing `BuildConfig` requires `buildFeatures { buildConfig true }` in
  `apps/android/app/build.gradle` — AGP 8+ stopped generating that class by default.

- **iOS**: use `http://localhost:3334` — unlike the Android emulator, the iOS Simulator shares the
  Mac's own network stack directly, so `10.0.2.2` means nothing there and `localhost` is correct.
  iOS also blocks cleartext by default (App Transport Security) — `apps/ios/App/App/Info.plist`
  sets `NSAppTransportSecurity` → `NSAllowsLocalNetworking`, Apple's built-in ATS exception scoped
  to loopback/`.local` addresses specifically (not a blanket cleartext allowance), so it's left in
  for both Debug and Release rather than split by build configuration like the Android case above.

#### iOS walkthrough (Xcode) — for later, once Xcode itself finishes installing

1. Install Xcode from the App Store (or Apple Developer site), open it once to accept the license
   and let it install additional components. Xcode Command Line Tools alone (`xcode-select -p`)
   are not sufficient — the full Xcode.app + iOS Simulator are required.
2. `pnpm run cap:ios` (equivalent to `npx cap open ios`) opens `apps/ios/App/App.xcworkspace`.
3. Pick a Simulator target from the scheme dropdown, click Run (▶). First build resolves Swift
   Package dependencies — can take a few minutes.

#### "Refresh now" button (discovered during device testing, not in the original scope)

Android's WebView has no pull-to-refresh gesture the way a normal mobile browser tab does, so
once §4's device pass surfaced that gap there was otherwise no user-facing way to force a resync
on demand short of force-quitting the app. Added a "Refresh now" button to the Connection section
of Settings → Sync Status (`apps/web/src/routes/settings/sync/+page.svelte`), always visible
(unlike "Retry now", which only appears once something is actually queued) — triggers a full
`window.location.reload()` via a small wrapper (`apps/web/src/lib/reload.ts`, mirroring
`$lib/pwa/reset.ts`'s `resetApp()` v8-ignore convention for a call that would otherwise navigate
the real browser mid-test-suite). A reload re-runs every page's own fresh-data fetch on remount,
re-subscribes SSE, and re-triggers the flush/connectivity startup checks — simpler and more
robust than wiring a bespoke per-page refetch signal, and queued mutations survive it unaffected
(persisted in IndexedDB, not in-memory state).

#### Native SPA-fallback bug (discovered via the "Refresh now" button)

Reloading on a nested route (e.g. `/settings/sync`) in the Android emulator rendered the wrong
page (the prerendered "/" marketing splash) with broken icons and a console error
(`Failed to fetch dynamically imported module: https://localhost/settings/_app/...`). Root cause:
Capacitor's native local server hard-codes its SPA-fallback filename to `index.html` on both
platforms (`WebViewLocalServer.java`'s `handleLocalRequest`, `Router.swift`'s `route(for:)`) —
there's no way to point it at this project's `adapter-static` fallback file (`200.html`, chosen
specifically to avoid colliding with the real prerendered `/` page — see the fallback comment
above). It serves `build/index.html` for _any_ unmatched deep path. That file (the real prerendered
`/` page) used SvelteKit's default **relative** asset paths (`./_app/...`), correct only when
served from its own exact URL; served instead at `/settings/sync`, the browser resolves `./_app/...`
against the wrong base directory and every chunk 404s. `build/200.html` already used absolute paths
— `adapter-static` forces that for the fallback file specifically — so this only ever affected
`index.html`.

Fixed by adding `paths: { relative: false }` to the `sveltekit()` plugin options in
`apps/web/vite.config.ts`, forcing absolute (`/_app/...`) asset paths on _every_ prerendered page,
not just the fallback — safe here since this app always deploys at its domain root (no subpath
deployment to support, which is the only reason SvelteKit defaults to relative paths). Verified via
`pnpm --filter web run build`: both `build/index.html` and `build/200.html` now emit identical
absolute paths. This was a latent, general bug (any cold app-launch or deep link landing on a
nested route natively would have hit it) that the "Refresh now" button's real `location.reload()`
happened to be the first thing to actually trigger.

**Update**: device testing did surface exactly that — reloading (via "Refresh now" or pull-to-refresh)
anywhere but the root route consistently landed back on the root list view instead of refreshing
the current page, because `index.html`'s own client logic (redirecting an authenticated user to
`/lists`) ran once Capacitor's fallback served its content. The `paths.relative: false` fix above
only fixed the _crash_; it didn't stop the wrong page's content — and therefore its own redirect
logic — from loading in the first place. Implemented the previously-deferred routing fix after all:

- **Android**: `MainActivity.java`'s `setSpaFallbackRoute()` installs a `RouteProcessor`
  (`bridgeBuilder.setRouteProcessor(...)`, set before `super.onCreate()` builds the Bridge) that
  redirects the literal `/index.html` fallback path to `/200.html`. Non-obvious gotcha: this same
  RouteProcessor is _also_ consulted for every regular asset request, not just the SPA-fallback
  branch (`WebViewLocalServer`'s generic `PathHandler#handle`, used for every `.js`/`.css`/etc.
  file) — an unconditional redirect broke every asset load (each one got 200.html's HTML back
  instead of its real content, `SyntaxError: Unexpected token '<'` on whichever chunk loaded
  first). Checking for the exact literal `/index.html` scopes the redirect to only the one branch
  that actually needs it and passes every real asset path through unchanged.
- **iOS**: `MainViewController.swift`'s `SpaFallbackRouter` didn't hit the same bug — it already
  mirrored `CapacitorRouter`'s own `pathExtension.isEmpty` check (real per-request path awareness
  on iOS, unlike Android's literal-string fallback signal), so it was already scoped correctly to
  only extensionless SPA routes.

Verified on Android via a real device pass: cleared app data, cold-launched to `/server-setup`
(correct — no bounce), triggered a reload there via a swipe gesture, confirmed via logcat that
`https://localhost/server-setup` was fetched with every chunk loading cleanly (no syntax errors)
and the app stayed on that screen instead of returning to the root list view. iOS not yet verified
on-device (deferred with the rest of the iOS walkthrough, pending Xcode).

#### Native pull-to-refresh (follow-up to "Refresh now")

Neither platform's WebView has a built-in pull-to-refresh gesture — that's a Chrome/Safari
browser-tab UI feature, not something exposed by the WebView platform APIs a hybrid app embeds —
so "Refresh now" alone left native feeling less responsive than a typical mobile app. Added the
real native gesture on both platforms, wired to the same reload action as the button:

- **Android**: `apps/android/app/src/main/java/.../MainActivity.java`'s `setUpPullToRefresh()`
  re-parents Capacitor's `WebView` inside a `SwipeRefreshLayout`
  (`androidx.swiperefreshlayout`, added to `variables.gradle`/`app/build.gradle`) and calls
  `webView.reload()` on trigger. Stopping the spinner uses `Bridge#addWebViewListener`
  (`WebViewListener.onPageLoaded`/`onReceivedError`/`onReceivedHttpError`) — Capacitor's own
  supported hook for this, rather than replacing `BridgeWebViewClient` (which also handles local
  asset routing) just to observe load completion.
- **iOS**: `apps/ios/App/App/MainViewController.swift` (new) subclasses `CAPBridgeViewController`,
  overriding `capacitorDidLoad()` to attach a `UIRefreshControl` to the WKWebView's `scrollView`
  and reload on trigger. `CAPBridgeViewController`'s own `WKNavigationDelegate` is internal with
  no public "navigation finished" hook (unlike Android's `WebViewListener`) — stopping the spinner
  instead observes `webView.isLoading` via KVO, a standard WebKit property independent of
  Capacitor's internal delegate wiring. `Main.storyboard`'s root view controller references
  `MainViewController`, and the new file is registered in `project.pbxproj` (hand-edited —
  validated with `plutil -lint`) — **but neither actually wires the class in at runtime; see the
  SceneDelegate bug below**, found only once real device testing exercised this code path.

Both call the platform's native `reload()` directly rather than going through
`apps/web/src/lib/reload.ts`'s `refreshApp()` — same effect (a real navigation reload, hitting the
same fixed SPA-fallback routing above), just triggered from native code instead of JS, so there's
no native-to-JS bridge call needed for the common case.

#### iOS: MainViewController was never actually instantiated (found on device pass)

Both "Refresh now" and pull-to-refresh appeared to bounce back to the root list view on iOS,
mirroring Android's original SPA-fallback bug — despite `SpaFallbackRouter` (the fix for that
exact bug) already being in place. Root cause, found only by testing on a real simulator rather
than trusting the code: `apps/ios/App/App/SceneDelegate.swift` hard-codes
`window?.rootViewController = CAPBridgeViewController()` — Capacitor's generated default, and a
completely different line from anything `Main.storyboard` controls. This project's `SceneDelegate`
builds its window/root view controller programmatically and never loads the storyboard at
runtime, so `Main.storyboard`'s `customClass="MainViewController"` reference (and the
`project.pbxproj` registration) were both real, valid, and entirely inert — `MainViewController`
was compiled into the binary (confirmed via `strings` on the built binary and the compiled
`Main.storyboardc`) but never constructed, so neither `router()` nor `capacitorDidLoad()` ever ran.

This is why earlier verification looked convincing without being real proof: a cold launch to `/`
resolves correctly under Capacitor's _default_ router too (`index.html` genuinely is the right
file for that one URL), and reaching `/login` via `goto()` is a client-side SvelteKit route change
that never touches native routing at all — neither test actually exercised `SpaFallbackRouter`.
Confirmed the fix with `fatalError()` placed at the top of `capacitorDidLoad()`: the app kept
running uncrashed against the old `SceneDelegate`, and crashed immediately once
`SceneDelegate.swift` was corrected to construct `MainViewController()` instead. Fixed by changing
that one line; `Main.storyboard`'s reference was already correct and needed no change.

**Lesson for future native-shell work here**: a subclass compiling cleanly and even being
referenced by a storyboard is not evidence it's the class actually driving the screen — trace
where `UIWindow.rootViewController` (iOS) / the launched `Activity` (Android) is actually
constructed before trusting an override chain, especially on Capacitor's newer SPM-based
templates where `SceneDelegate` frequently bypasses the storyboard entirely.

#### iOS: pull-to-refresh visual polish (found on device pass, after the SceneDelegate fix)

With `MainViewController` actually wired in, `UIRefreshControl` was confirmed _functionally_
working via a temporary fire-counter overlay (8 successful reloads triggered across one test) —
but with no visible spinner, which is why it initially looked broken. Two contributing issues,
both cosmetic once the fire-counter proved the mechanism itself was sound:

- The diagnostic overlay used to investigate this was very likely covering the actual spinner's
  screen region itself (same top-of-content area) — removing it was part of the fix.
- The rubber-band overscroll area was the scroll view's own background color showing through,
  defaulting to plain white rather than the app's theme. `MainViewController` now sets
  `webView.scrollView.backgroundColor` and the refresh control's `tintColor` from the same
  `--color-paper`/`--color-ink` values as `apps/web/src/routes/layout.css`, picked via
  `traitCollection.userInterfaceStyle`. This follows system light/dark, not the web layer's own
  in-app theme setting (light/dark/automatic, stored in `localStorage`) — there's no live channel
  from web to native for that, and system-appearance-following covers the common case (most users
  leave the in-app setting on "automatic") without needing a bridge call just for this one detail.

#### WebKit auto-zoom stuck across client-side navigation (found on iOS device pass)

Testing the `/server-setup` → `/login` flow on the iOS Simulator surfaced a second, unrelated
native-shell bug: after focusing the Server URL field and submitting, `/login` rendered zoomed in
— inputs and the "Forgot password?" link cut off past the right edge, no right-side margin. Root
cause: WebKit automatically zooms the page when a focused `<input>`'s font-size is under 16px
(several inputs render at flowbite-svelte's default 14px, `text-sm`) — ordinarily self-correcting
once the input blurs on a real page, but `goto('/login')` is a client-side SvelteKit route change,
not a fresh page load, so nothing ever reset the scale on the same persisting WKWebView instance;
it carried the zoomed-in state onto the new page's content. Confirmed this was WebKit-specific and
not an app-level CSS bug by reproducing the identical narrow-viewport flow (direct load and
client-side nav alike) in a real headless browser first — renders correctly there.

First attempt — disabling `UIScrollView.minimumZoomScale`/`maximumZoomScale` on the native side —
did **not** fix it (verified on-device, not just assumed): the automatic focus-zoom apparently
doesn't route through the scroll view's public zoom API the same way manual pinch-zoom does.
Reverted that. The actual fix lives at the page level, where WebKit computes the auto-zoom in the
first place: `apps/web/src/app.html`'s `<meta name="viewport">` now adds `maximum-scale=1`. Applies
to the PWA/Mobile Safari build too, not just native — same WebKit engine, same client-side-routing
architecture, so the same failure mode is reachable there, not something scoped to Capacitor.
Verified via a second on-device pass (fresh install, same repro path): `/login` renders full-width,
no cutoff.

#### What "done" looks like for this section

Manual verification per the plan's top-level Verification section: fresh install → `/server-setup`
gate → enter a real URL → ping succeeds → lands on `/login` → log in → list CRUD against the real
API → airplane mode → offline edits → reconnect → sync confirms → background the app ~1 minute →
foreground → SSE reconnects (realtime updates resume without a manual refresh) → Settings → Server
→ Change → back to `/server-setup`.

### 5. Close the remaining online-only mutations — **done**

Phase 5 (`foundational/PLAN.md`, Phase 5 status note) shipped offline-first writes for per-row create/update/delete, but explicitly left three call sites online-only because they didn't fit the single-row temp-id/`expectedVersion` model `offlineCreate`/`offlineMutate` (`apps/web/src/lib/offline/sync-engine.ts`) were built around: `reorderCategories`, `reorderStoreCategories`, and `attachStore`'s by-id path plus `addFavoriteToList`.

Implemented as designed, with two discovered refinements to the original plan:

- `QueuedMutation.op` (`apps/web/src/lib/offline/db.ts`) gained `'reorder'` and `'attach'` variants. Reorder applies the new `sortOrder` to every affected local Dexie row immediately, queues one mutation via a new `offlineReorder` helper (`sync-engine.ts`, parallel to `offlineCreate`/`offlineMutate`), and marks every touched row dirty (`isRowDirty()` extended for the compound-keyed `storeCategoryOrders` table). Attach reuses `offlineCreate` outright (`op?: 'create' | 'attach'`, defaulting to `'create'`) rather than a separate helper — the mechanics are identical, `'attach'` exists purely so the sync-status page can describe it accurately instead of mislabeling it "Create".
- **No conflict-handling path was added for reorder/attach, by design, not oversight**: the original plan expected 409s might occur ("replayed after another device already changed the same order"), but the actual reorder/attach endpoints (`categories_controller.ts`'s `reorder`, `stores_controller.ts`'s `reorderCategories`, the attach-by-id and add-to-list POSTs) never call `hasVersionConflict` — they bump versions or create rows unconditionally, with no `expectedVersion` check. A 409 is structurally impossible from these endpoints today, so `offlineReorder` queues with `expectedVersion: null` and `flush.ts`'s new `replayReorder` has no conflict branch. Redesigning those endpoints to support optimistic-concurrency checking on a bulk payload would be a real backend change outside this plan's scope.
- `attachStore`'s by-id path has no live UI call site today (only `stores.spec.ts` exercises it directly) — its offline placeholder is exactly as best-effort as the original plan described, with no visible-regression risk either way.
- Out of scope, deliberately: making `fetchCategories`/`fetchStoreCategoryOrder` merge locally-dirty rows on read (mirroring the `fetchItems` fix in the `2026-08-21` "offline sync DOM visibility" commit) — that would keep an offline reorder visible across a page navigation/reload during the offline window, but wasn't part of this section's ask, which was the write-side queue/dirty-flag/self-mutation-suppression mechanics. The calling components' own optimistic array updates (`categories/+page.svelte`, `stores/[storeId]/+page.svelte`) already keep the reorder visible for the in-memory session.

### 6. Settings sync-status page + banner — **done, superseded by Phase 14**

`foundational/PHASE14_PLAN.md` shipped this in full, ahead of this phase: `SyncStatusBanner.svelte`/`SyncToast.svelte` were deleted, and `apps/web/src/routes/settings/sync/+page.svelte` (linked from Settings, per `apps/web/src/routes/settings/+page.svelte`) now shows connection status, last successful sync time, and a per-item queued/failed list with "Retry now" — backed by `apps/web/src/lib/offline/connectivity.svelte.ts` (a real `/api/v1/ping` reachability probe, not just `navigator.onLine`) and a top-of-app `SyncStatusIcon.svelte` cloud-disconnected indicator replacing the old banner. Verified present in the codebase as of this review (2026-08-21) — no further work needed here; this phase's remaining sections (offline reorder/attach, native shell, CI) build on top of that connectivity/sync-status layer rather than creating it.

### 7. CI: signed build artifacts (this phase's exit criterion) — **done**

New `.github/workflows/native-build.yml`, alongside the existing `docker-publish.yml` pattern —
same trigger (`push: tags: ["v*.*.*"]`) and same `test.yml` gate, but attaches its outputs as
**assets on the GitHub Release for that tag** (via `softprops/action-gh-release`) rather than
only leaving them as plain workflow-run artifacts — the maintainer's explicit preference over the
plan's original "workflow artifacts only" wording, since a Release asset is downloadable straight
from the Releases page without a logged-in GitHub session or a 90-day expiry.

- **`test`**: reuses `test.yml`, same as `docker-publish.yml` — nothing native builds without the
  full lint/typecheck/test gate passing first.
- **`build-android`** (`ubuntu-latest`): `pnpm --filter @everylist/web run cap:sync` (build + sync,
  the same local dev command), then `./gradlew assembleDebug` for a **debug-signed APK** — there's
  no release-signing keystore yet (maintainer's call: ship debug-signed for now rather than block
  this section on generating one), so this is sideload-ready today but not a Play-Store-submission
  artifact. Swapping in `assembleRelease` plus a keystore-backed signing config (secrets:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD` would be the natural names) is a self-contained follow-up once one exists
  — doesn't change this workflow's shape. `android-actions/setup-android` + `actions/setup-java`
  (Temurin 21, matching AGP 8.13's requirement) precede the Gradle build; `sdkmanager --licenses`
  accepted up front so AGP can auto-fetch the `compileSdk 36` platform/build-tools it needs.
- **`build-ios`** (`macos-latest`): same `cap:sync`, then `xcodebuild` against `App.xcodeproj`
  directly — Capacitor 8's default template resolves native deps via Swift Package Manager, not
  CocoaPods, so there's no `.xcworkspace` here despite §4's walkthrough describing one (written
  against an older Capacitor/CocoaPods assumption; not corrected there since that section is a
  manual-verification walkthrough, not code). Builds `-sdk`/`-destination 'generic/platform=iOS
Simulator'` with `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` — an **unsigned Simulator
  build only** (maintainer's call: no Apple Developer Program enrollment yet, which a real
  device/TestFlight-capable build requires — see the plan's original wording, unchanged). Zipped
  (`App.app` → `.zip`, since a raw `.app` directory isn't practical as a single release asset) and
  uploaded.
- **`release`**: needs both build jobs (not run inline in each, to avoid two concurrent
  `action-gh-release` calls racing to create the same tag's Release), downloads both artifacts, and
  calls `softprops/action-gh-release` once with both files — creates the Release if the tag doesn't
  have one yet, or appends to it if `docker-publish.yml`'s tag push already triggered other
  automation. Needs `permissions: contents: write` for the default `GITHUB_TOKEN` to create/update
  a Release and upload assets.

Verified locally before relying on CI: `pnpm --filter @everylist/web run cap:sync` (clean sync into
both native projects), `apps/android`'s `./gradlew assembleDebug` (builds `app-debug.apk`), and the
exact `xcodebuild` invocation above against `apps/ios/App/App.xcodeproj` (builds `App.app` for
`iphonesimulator`) all succeed on the maintainer's machine — the workflow's shape isn't newly
invented, it mirrors commands already known to work locally.

### 8. Native offline reads: cache-fallback for GET fetchers — **done**

Found via a real device pass, not code review: on native, `/lists` showed "Failed to load
lists." with an empty state when the API server was down — even though Dexie already had cached
list data from earlier in the same session. Root cause: the PWA/browser build gets a `NetworkFirst`
Workbox cache on every `/api/v1/*` GET (`apps/web/pwa.config.mjs`), falling back to the last
successful Cache Storage response on a network failure — but native never registers that service
worker at all (§3's deliberate SW gating: unsupported/unreliable against Capacitor's local
`https://localhost` origin), and nothing had ever been put in its place. The write side (offline
mutation queue, `sync-engine.ts`, `flush.ts`) was already genuinely offline-first; only reads were
broken, and only on native.

- New `apps/web/src/lib/api/cache-fallback.ts`: a single shared `withCacheFallback(request,
fallback)` helper rather than duplicating the same `err instanceof ApiError` check at every call
  site (which `sync-engine.ts`'s `offlineCreate`/`offlineMutate` already do individually for
  writes). Falls back to cached data only on a genuine network failure — never on a real `ApiError`
  (404/403/401), since masking a real 403 with stale cache could show a list the user was just
  removed from. `fallback` returning `undefined` means "nothing cached," and rethrows the original
  error; a collection-shaped fallback returns `[]` for "cached but empty," which is a legitimate
  result, not a rethrow trigger.
- `apps/web/src/lib/offline/db.ts`, `version(3)`: new `folders` table (`FolderDto`, no `_dirty`
  bookkeeping — folders have no offline write path) and `OfflineList._localSortOrder` — `ListDto`
  has no server-exposed position field of its own (unlike `CategoryDto`/`ItemDto`/`FolderDto`,
  which all have `sortOrder`), so this is the only way an offline `fetchLists` fallback can
  reproduce the user's chosen order. Set from array index in `fetchLists`; preserved (not reset)
  when a single-row `fetchList` re-puts that row.
- `fetchList`/`fetchLists` (`lists.ts`) and `fetchFolders` (`folders.ts`) get their first-ever
  Dexie caching, using the `lists` table (previously declared but fully dead code — nothing had
  ever written or read it) and the new `folders` table. `fetchStoreCategoryOrder` (`stores.ts`)
  gets the same treatment using the already-existing `storeCategoryOrders` table (already written
  by the offline _write_ path's `offlineReorder`/`replayReorder`, just never read back). This was
  the highest-leverage part of the fix — nearly every page's first parallel fetch is
  `fetchList(listId)`.
- `fetchCategories`, `fetchItems`, `fetchStores`, `fetchFavorites` already cached their responses
  into Dexie on success (`bulkGet`/skip-`_dirty`/`bulkPut`) — only the fallback half was missing;
  their existing bodies are unchanged, just wrapped as `withCacheFallback`'s `request` closure.
- **Pages needed zero changes.** Every page's `loadAll()` already had the shape
  `try { […] = await Promise.all([fetchX(), …]) } catch { error = … }` — since the fallback now
  lives inside the `fetch*` functions, `Promise.all` resolves normally whenever cached data was
  found, and the existing catch only fires when there's truly nothing (no cache and no network),
  which is already correct. No new offline banner needed either — a page populated from cache is
  already covered by the existing global `SyncStatusIcon`/`connectivity.svelte.ts` indicator (§6).
- **Explicitly out of scope**: `members`/`invites`, `recently-deleted` (`fetchRecentItems` — not
  to be confused with `fetchRecentItemNames`, the _autocomplete_ suggestions function, which
  already had its own offline fallback before this work and was untouched), `fetchProfile`,
  `fetchMeta` stay network-only. Membership/invite data reflects who currently has access — a
  stale cache could show someone as still having access after removal (or the reverse), a worse
  failure mode than an honest error, unlike a list's own name/color staying stale.
  `recently-deleted` is a time-boxed recovery workflow where a stale cache could misrepresent
  what's actually still recoverable. None of the four have a Dexie table today, and unlike the six
  entities above (all simple `id`-keyed rows), members/invites have accept/decline state machines
  with no natural single-row versioning to build a cheap cache-fallback around.
- **Found only by running the full suite, not by review**: `routes/lists/+page.svelte.spec.ts` is
  the one page spec that stubs the global `fetch` directly instead of mocking `$lib/api/lists`/
  `$lib/api/folders` — every sibling page spec does mock the API module and was correctly
  unaffected. Since this spec runs in a real browser (vitest-browser-svelte) with real IndexedDB,
  it now exercises the genuine Dexie fallback, and surfaced two real things: (1) Dexie state was
  leaking between tests in that file with nothing resetting it (fixed with a `resetDbForTesting()`
  in `afterEach`, following the offline-spec convention used elsewhere); (2) its "generic error on
  a non-ApiError failure" test was testing behavior that's no longer reachable by design — a plain
  network failure with nothing cached now resolves to the empty state, not an error — so it was
  repurposed to assert exactly that, with a new adjacent test (stubbing `indexedDB` itself as
  `undefined`) covering the one way "Failed to load lists." _is_ still reachable: Dexie truly
  unavailable, not just the network being down.
- Two genuine coverage gaps (not the cross-file artifact below) needed real tests, not
  suppression: `lists.ts`'s fallback sort comparator (`(a._localSortOrder ?? 0) - (b…)`) needs a
  row with no `_localSortOrder` — reachable in practice via a list cached only through `fetchList`,
  never through `fetchLists` — to exercise its `?? 0` branches; `items.ts`'s fallback sort
  comparator needs _two_ cached rows, since `Array.prototype.sort` never invokes its comparator at
  all for a zero/one-element array.
- The now-familiar Vitest browser-mode cross-file coverage artifact (documented repeatedly
  elsewhere in this codebase, e.g. `lib/api/selected-store.ts`) showed up twice more here: the new
  `if (db) { … }` branch in `lists.ts`/`folders.ts`'s success path, and the new
  `withCacheFallback` import itself in `categories.ts`/`items.ts`/`stores.ts`/`favorites.ts` (each
  provably 100% in isolation, degrading only once merged with every other spec mocking those same
  modules) — both bracketed with `/* v8 ignore start/stop */` following the established
  convention, the import case by folding it into each file's existing `getDb` ignore block rather
  than adding a second one.
- Recommended e2e addition, added: `apps/web/e2e/offline-sync.e2e.ts` gained a second test
  alongside the existing offline-write scenario — creates a list, adds an item, reloads once
  online (warming Dexie via a real `fetchList`/`fetchItems`), then blocks only `/api/v1/**` via
  `page.route(...).abort()` (not `page.context().setOffline(true)`, which also blocks the dev
  server's own page/JS delivery — inaccurate here, since a native app's shell always loads
  instantly from local files regardless of network state, only its API calls fail) and hard-reloads
  to confirm the list still renders instead of "Failed to load list." This is the one test that
  actually exercises the bug as found, the same way this phase's own history (the iOS
  `SceneDelegate` bug in §4, the SPA-fallback bug in §4) has repeatedly shown code review alone
  missing real defects.

Verified: `pnpm --filter web run check`, `pnpm --filter web run lint`, `pnpm --filter web run
test` (100% statements/branches/functions/lines), and `pnpm exec playwright test
e2e/offline-sync.e2e.ts` (both scenarios) all pass.

### 9. iOS device pass on §8, plus three follow-ups — **done**

§8's cache-fallback fix, along with the pull-to-refresh and SPA-fallback fixes from §4, were
manually verified on the iOS Simulator: nested-route reload no longer bounces to the marketing
splash, pull-to-refresh works, and a previously-opened list renders from cache with the API dev
server stopped. That pass surfaced three follow-ups, all done:

- **Stray `Splash.imageset` files.** Xcode flagged "The image set 'Splash' has 3 unassigned
  children." The imageset folder held both the correctly-generated `Default@1x/2x/3x~universal~
anyany(-dark).png` set (which `Contents.json` actually references) and three leftover
  `splash-2732x2732*.png` files from the original Capacitor template, committed in §2 and never
  cleaned up. Deleted — nothing referenced them.
- **`fetchPing` had no request timeout** (`apps/web/src/lib/api/ping.ts`). The connectivity
  monitor (§6) relies on `navigator.onLine`'s `offline` event for a real network drop, but that
  event never fires when only the _server process_ dies with the network interface still up (e.g.
  stopping the local dev API to simulate an outage) — detection then depends entirely on the 30s
  ping interval. On the Android emulator, a bare `fetch()` to a closed port routed through its
  virtual network layer (`10.0.2.2`) was observed taking far longer than 30s to fail, unlike the
  iOS Simulator (shares the Mac's real network stack, gets a near-instant refusal) — a single
  stalled ping could block detection indefinitely. Fixed with `signal: AbortSignal.timeout(5_000)`
  on the ping's `fetch` call, bounding every attempt to 5s regardless of platform.
- **New: periodic background sync**, keeping every list's offline cache warm, not just ones
  already opened — the natural follow-up to §8, which only helps a list that's been fetched at
  least once. New `apps/web/src/lib/offline/background-sync.ts`: an immediate sync on start, then
  every 5 minutes while the app is open, plus once on every native resume-from-background
  (`@capacitor/app`'s `appStateChange`, the same event `realtime.ts` already uses to rebuild its
  SSE subscription on resume). For each non-archived list, sequentially (not all at once — avoids
  spiking request count/battery for an unbounded list count), runs the same parallel fetch set as
  `routes/lists/[id]/+page.svelte`'s own `loadAll()` (`fetchList`/`fetchCategories`/`fetchItems`/
  `fetchStores`, plus `fetchStoreCategoryOrder` when a store is selected for that list), so the
  cache ends up in the same state a real visit would leave it in. Skips the whole run when
  `connectivity.serverUnavailable` (§6) is already true, and swallows any one list's failure
  without aborting the rest — a silent background operation with no UI of its own. Wired into
  `+layout.svelte`'s root `onMount` alongside `startFlushLoop()`/`startConnectivityMonitor()`.
  - **Deliberately not a true OS-level background task** (iOS `BGTaskScheduler` / Android
    `WorkManager`, which is what AnyList's non-hybrid native app uses) — this app's Dexie/
    IndexedDB cache lives inside the WKWebView/WebView's own storage, which native Swift/Kotlin
    code can't reach while the app is fully closed. Scoped, with the user's explicit sign-off, to
    the achievable tier: sync while the app is open or resuming, not while fully closed.
  - Tested in the plain-node Vitest project (not `.svelte.spec.ts`/browser, since this module has
    no reactive `$state`) — following `flush-loop-online.spec.ts`'s established convention of
    stubbing `globalThis.window = new EventTarget()` in `beforeEach` to satisfy the module's own
    `typeof window === 'undefined'` SSR guard, since the "server" Vitest project has no real
    `window`.

Verified: `pnpm --filter web run check`, `pnpm --filter web run lint`, `pnpm --filter web run
test` (100% statements/branches/functions/lines) all pass.

### 10. Uniform top padding under the notch/Dynamic Island — **done**

Every top-level `<main>` used a flat `p-8` (2rem) top padding, with no `env(safe-area-inset-top)`
at all — fine on Android's small punch-hole-camera inset, but on notched/Dynamic-Island iPhones the
page heading (`PageHeader`'s `<h1>`) sat close enough to clip under it. The one exception,
`routes/lists/[id]/+page.svelte`'s sticky header, _did_ add `pt-[env(safe-area-inset-top)]` — but
on top of the surrounding `<main>`'s own `p-8`, stacking to `2rem + inset` and looking noticeably
over-padded by comparison.

Fixed by replacing every `<main>`'s top padding with `pt-[max(env(safe-area-inset-top),2rem)]`
(`px-8 pb-8` for the rest) — the existing 2rem on non-notched devices where the inset is smaller,
the real inset on notched ones, never both stacked. `[id]/+page.svelte` needed the value on its
sticky inner header instead of `<main>` (dropped to `px-8 pb-8`, no top padding of its own) so the
sticky header's edge is what actually clears the notch as the page scrolls underneath it. Purely a
class-level change, one line touched per route — no `.svelte` markup restructuring, no logic.

Verified: `pnpm --filter web run check`, `pnpm --filter web run lint`, `pnpm --filter web run
test` (100% statements/branches/functions/lines) all pass. Visual re-check on-device is the
maintainer's to do (Simulator/emulator can't be driven from here).

## Execution order

The sections above are scoped, not sequenced — here's the actual build order and why, reviewed 2026-08-21:

1. **§1 (base URL + CORS) — done.** The acknowledged load-bearing decision — §2/§3/§4/§7 all assume it's done, since nothing native can reach the real API or pass CORS without it. Small and mechanical; fully unit-testable without any native tooling.
2. **§5 (offline reorder/attach/favorite-add gaps) — done.** No dependency on Capacitor — touches only the sync engine (`db.ts`, `sync-engine.ts`, `sync-queue.ts`, `flush.ts`, `categories.ts`/`stores.ts`/`favorites.ts`) and is testable today via the existing Vitest/Playwright suite. Sequenced early (rather than right before §4) so the native app is offline-complete from the point it exists, not patched right before the device pass. It does need to be _done_ before §4, since §4's manual verification re-tests these paths on-device.
3. **§2 (add Capacitor) — done.** Needed §1 done first — no point wiring the native shell before it has anywhere real to point.
4. **§3 (PWA/WebView reconciliation — SW gating, badge, SSE reconnect) — done.** Needed §2's native projects to exist, since it's reconciling PWA behavior _against_ the Capacitor WebView.
5. **§4 (local build + manual device verification).** The integration checkpoint for §1–§3 and §5 together. **Needs the maintainer directly** — Xcode/iOS Simulator and Android Studio/emulator require a local GUI that isn't drivable from an agent session; native projects/configs/CLI builds can be prepared ahead of time, but the simulator/device walkthrough itself is a manual handoff.
6. **§7 (CI signed builds) — done.** Automated the same `cap:sync` → build recipe already verified locally in §4. Shipped without either optional prerequisite — debug-signed Android and unsigned-Simulator iOS, both explicit maintainer calls rather than blocking on a keystore/Apple Developer enrollment that doesn't exist yet; either can be added later as a self-contained follow-up (see §7).

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
- `apps/web/src/lib/api/cache-fallback.ts` — new, the shared network-first/Dexie-fallback helper. **Done.**
- `apps/web/src/lib/offline/db.ts` — `folders` table (`version(3)`), `OfflineList._localSortOrder`. **Done.**
- `apps/web/src/lib/api/lists.ts`, `apps/web/src/lib/api/folders.ts` — `fetchList`/`fetchLists`/`fetchFolders` gain their first Dexie caching + fallback. **Done.**
- `apps/web/src/lib/api/categories.ts`, `apps/web/src/lib/api/items.ts`, `apps/web/src/lib/api/stores.ts` (`fetchStores` + `fetchStoreCategoryOrder`), `apps/web/src/lib/api/favorites.ts` — cache-fallback added to their existing fetchers. **Done.**
- `apps/web/src/routes/lists/+page.svelte.spec.ts` — `resetDbForTesting()` cleanup added, one test repurposed to match the new fallback-to-empty-state behavior, one new test added for the Dexie-truly-unavailable case. **Done.**
- `apps/web/e2e/offline-sync.e2e.ts` — new offline-read scenario. **Done.**
- `apps/web/src/lib/api/ping.ts` — `AbortSignal.timeout(5_000)` added to the ping's `fetch` call. **Done.**
- `apps/web/src/lib/offline/background-sync.ts` — new, the periodic all-lists cache warmer. **Done.**
- `apps/web/src/routes/+layout.svelte` — `startBackgroundSync()` added alongside the other two `start*` calls in `onMount`. **Done.**
- `apps/ios/App/App/Assets.xcassets/Splash.imageset/` — three orphaned template files deleted. **Done.**
- Every top-level `<main>` under `apps/web/src/routes/**/+page.svelte` (28 files) — top padding
  changed to `pt-[max(env(safe-area-inset-top),2rem)]`; `lists/[id]/+page.svelte`'s sticky header
  carries it instead of its `<main>`. **Done.**
- `.github/workflows/native-build.yml` — new: builds a debug-signed Android APK and an unsigned
  iOS Simulator build on every `vX.Y.Z` tag push, attached as GitHub Release assets. **Done.**

## Verification

- `pnpm --filter web build && pnpm --filter web check` stays clean (typecheck/lint unaffected by the server-URL change).
- Existing Vitest suite for `apps/web` stays at the 100% coverage gate — `server-url.ts`/`base-url.ts`/`ping.ts`'s runtime resolution logic and `/server-setup`'s validate/ping/save flow all need unit coverage.
- Manual device verification on both platforms: fresh install lands on `/server-setup` (not `/login`) before any server is configured; entering a real URL pings it and proceeds to login; entering an unreachable one shows the warning and "Continue anyway" still works; Settings → Server → Change clears the session and returns to `/server-setup`. Then: login (token storage/persistence across app restarts), list CRUD against the real HTTPS API, offline mode (airplane mode → add/edit items → reconnect → confirm sync, reusing the existing Phase 5 offline behavior), and SSE reconnect after backgrounding the app for a minute and returning to it.
- Offline mode additionally covers the newly-closed gaps: reorder categories/store aisle order while offline and confirm the new order survives a reconnect; add a favorite to a list and attach an existing store while offline and confirm both resolve correctly on flush.
- Settings sync-status view (already shipped, Phase 14): confirm the newly-queued reorder/attach mutations from this phase show up correctly in `/settings/sync`'s queued-item list alongside the existing create/update/delete entries.
- CI: pushing a `vX.Y.Z` tag produces a GitHub Release with a downloadable Android debug APK and an iOS Simulator build attached — **verified structurally** (workflow YAML validated, and each build command — `cap:sync`, `gradlew assembleDebug`, the `xcodebuild` invocation — run successfully on the maintainer's machine first); an actual tag push through CI to confirm the Release/asset-upload plumbing end-to-end is the maintainer's to do.

## Play Store release — maintainer to-do (2026-08-23)

The maintainer now has a Google Play developer account. `apps/android/app/build.gradle` and
`.github/workflows/native-build.yml` were updated to support a signed release build (reading the
keystore/passwords from env vars or a gitignored `keystore.properties`, with CI falling back to a
debug build until the signing secrets exist), but the following steps still need the maintainer
directly — none of it can be done from an agent session:

1. Generate a release keystore (`keytool -genkey -v -keystore ... -alias everylist -keyalg RSA -keysize 2048 -validity 10000`) and store the file + its passwords somewhere durable outside the repo. Losing it means the app can never be updated again under that Play listing; leaking it lets anyone sign as the app.
2. Add four GitHub Secrets to the repo: `ANDROID_KEYSTORE_BASE64` (the keystore file, base64-encoded), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Once these exist, `native-build.yml` automatically switches from a debug APK to a signed release AAB/APK on the next tag push.
3. Create the app in Google Play Console: store listing (screenshots, description, icon), content rating questionnaire, data safety form, a hosted privacy policy URL, app access declaration, pricing/distribution/countries.
4. Push a `vX.Y.Z` tag once the secrets are in place, download the resulting signed `.aab` from the GitHub Release, and upload it manually through Play Console to create the app's first release (this first upload can't be automated — the app has to exist in Console first).
5. Enroll in Play App Signing when Console prompts on that first upload (Google's recommended default: you keep an upload key, Google holds the real signing key, and a compromised upload key can be reset without losing the app).
6. Budget for Google's closed-testing requirement on new developer accounts: at least 20 testers enrolled for 14 continuous days before Play allows a production release. Start this track early since it's on the critical path to going live, not optional.
7. Only after that: promote Internal Testing → Closed Testing → Production.
