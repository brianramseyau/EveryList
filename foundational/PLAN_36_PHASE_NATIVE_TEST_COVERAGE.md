# Phase 36 — Full Test Coverage for the Native Shells (Android, iOS, Desktop)

## Status

- **PR 1 (Android: Robolectric + tests + raised gate) — done** on this branch. The app's
  `app/src/test` suite now runs under Robolectric (17 test classes over the widget, its popups,
  receivers, plugins and prefs), the JaCoCo gate is raised from 0.16 to **0.94** (measured 94.44%
  line), `HttpJson` gained a swappable transport seam (also closing the old PATCH-untestable gap),
  `RefreshGestureAwareLayout`/`spaFallbackPath`/`applyOptimisticToggle`/`retryDelayMs` were extracted
  for direct testing, the Capacitor scaffold tests were deleted, and CI gained a Robolectric jar
  cache. The gate was verified locally against a userspace Temurin 21 + Android SDK 36.
- **PR 2 (iOS target + desktop `main.cjs`/`preload.cjs` extraction) — not yet started.**
- **PR 3 (remaining docs) — folded in**: `AGENTS.md`, `docs/development/testing.md`,
  `docs/android-ios.md`, `README.md`, `scripts/check.mjs` and the PLAN_00 roadmap all updated in
  this pass; this plan itself is the record.

## Context

Every pnpm workspace (`packages/shared`, `apps/api`, `apps/web`, `apps/desktop`'s `lib/`,
`apps/cli`) enforces the PLAN_00 §11 policy: 100% statements/branches/functions/lines.

The native shells are the exception, and the gap is large:

- **`apps/android`** is a Gradle project, not a pnpm workspace. Its JaCoCo gate
  (`apps/android/app/build.gradle`) is a **0.16 line ratchet** — deliberately far under 100%
  because, as its own comment says, "most of apps/android is Activities/RemoteViews/Capacitor
  plugin glue that needs the Android framework to exercise, so the JVM-reachable ceiling today is
  ~17%". Only `WidgetJson`, `DeadlineMath`, `HttpJson` and the GET/POST halves of `WidgetApiClient`
  are covered (~550 of 2,839 lines of `app/src/main`). `WidgetPrefs`, `WidgetUpdater`,
  `WidgetListViewsFactory`, every Activity, every plugin, and both receivers are untested. The one
  instrumented test (`QuickAddLayoutTest`) is compiled in CI but never run; the Capacitor scaffold
  `ExampleUnitTest`/`ExampleInstrumentedTest` are the only other tests (and the instrumented one
  asserts the wrong package name, so it would fail if ever run).
- **`apps/ios`** has three Swift sources and **no test target or scheme at all** in
  `App.xcodeproj/project.pbxproj`. `SpaFallbackRouter.route(for:)` and the theme-colour helpers are
  pure and cheap to test; the rest is boilerplate.
- **`apps/desktop`** is Electron, not Capacitor. `lib/*.cjs` is at 100%, but `main.cjs`/`preload.cjs`
  (344 lines) are excluded from the gate as "Electron wiring that can only be exercised by actually
  launching an app", so their branches — window-state clamping, tray/background-run decisions,
  navigation guards, second-instance lock, error logging — have no test at all.

None of this is captured in a plan yet; this phase is the audit and the work to close it, matching
the repo's rule that a lower gate is a documented, justified exception rather than an accident.

## Decisions

Confirmed with the user:

- **Target**: adopt **Robolectric** to bring Activities/Preferences/RemoteViews/receivers/plugins
  onto the JVM, then raise the Android line gate to the genuine reachable ceiling (estimate
  70–90%), with per-file one-line-justified excludes only — **not** a forced 100% parity. iOS gets a
  real XCTest target; desktop's excluded wiring is moved into tested `lib/` modules.
- **Scope**: Android + iOS + desktop. No changes to the workspaces already at 100%.
- **CI**: **JVM-only** — Robolectric runs on a normal `ubuntu-latest` runner. No emulator/device job
  and no instrumented-coverage merge; on-device layout/gesture tests stay a documented manual step.
- **No behavioural change** to shipping widget/app code. Refactors are seams/extractions only,
  verified by the existing instrumented test plus a manual device pass.

## PR 1 — Android: Robolectric + tests + raised gate

### Toolchain (`apps/android/app/build.gradle`)

- Add Robolectric (pin the newest 4.x supporting `compileSdk`/`targetSdk` 36 — verify at
  implementation; down-level with `@Config(sdk = …)` if needed), `androidx.test:core`,
  `androidx.test.ext:junit`.
- `android { testOptions { unitTests { includeAndroidResources = true; returnDefaultValues = true } } }`.
- Cache Robolectric's `android-all` jars (`~/.m2`, `~/.robolectric`) in the `android` job in
  `.github/workflows/test.yml`.
- Confirm JaCoCo's on-the-fly instrumentation still writes `jacoco/testDebugUnitTest.exec` and that
  the report aggregates Robolectric-run classes (verify first; fallback is offline instrumentation).

### Seams and extractions (no behaviour change)

- **HTTP seam in front of `HttpJson`** so `WidgetApiClient`, `DeadlineNotificationActionReceiver`,
  `RescheduleActivity` and `QuickAddActivity` can be driven by the existing `MiniHttpServer`
  without real sockets. This also removes the documented JVM gap where the JDK's `HttpURLConnection`
  rejects `PATCH` (see `WidgetApiClientTest`'s closing comment), finally covering
  `updateItemDeadline`/`toggleItem`.
- **Injectable API client** into `WidgetUpdater` (default = the real `WidgetApiClient`), matching the
  `setSyncBroadcasterForTesting`/`resetDbForTesting` convention already used elsewhere.
- **Extract `RefreshGestureAwareLayout`** out of `MainActivity` into its own package-private class;
  extract a pure `spaFallbackPath(basePath, path)` helper from `setSpaFallbackRoute`.
- Make `WidgetUpdater.applyOptimisticToggle` and the retry-delay math, `RescheduleActivity`'s
  `findItemDeadline`, and QuickAdd's create→PATCH reconcile decision package-private pure helpers.
- **Delete** `ExampleUnitTest`/`ExampleInstrumentedTest` (Capacitor scaffold; the instrumented one
  asserts `com.getcapacitor.app`).

### Tests (JVM)

Ordered by risk × reachability; each needs Robolectric's `RuntimeEnvironment`/`Shadow*` and, where
network-facing, the HTTP seam:

| File                                                                      | Approach                                                                                                                                                                                                              | Why                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `AuthPrefs`                                                               | SharedPreferences save/get/clear                                                                                                                                                                                      | low effort                                 |
| `WidgetPrefs`                                                             | prefs + `ShadowSettings` (`ANDROID_ID`, incl. the well-known broken value) + device-id hashing/random fallback; snapshot JSON round-trip                                                                              | high — token/credential handling           |
| `WidgetUpdater`                                                           | shadows for `AppWidgetManager`/`AlarmManager`/`NotificationManagerCompat`/`RemoteViews`; fake API client; retry/backoff, optimistic toggle + rollback, show/hide-completed, setup state, deadline-notification cancel | **highest** — the widget's whole behaviour |
| `WidgetListViewsFactory` / `WidgetListService`                            | Robolectric `RemoteViews` assertions per row state (checked, quantity, deadline chip colour)                                                                                                                          | high                                       |
| `EveryListWidget`                                                         | Robolectric `BroadcastReceiver` dispatch: refresh / toggle-completed / open-item / toggle-item / deep-link                                                                                                            | high                                       |
| `EveryListWidgetPlugin`, `AuthMirrorPlugin`, `DeadlineNotificationPlugin` | mocked `PluginCall`; reject/validate branches                                                                                                                                                                         | high                                       |
| `PullToRefreshControlPlugin`                                              | Robolectric Activity + UI-thread posting                                                                                                                                                                              | medium                                     |
| `QuickAddActivity`                                                        | Robolectric launch; deadline-picker UI, state restore, save success/failure, same-name reconcile                                                                                                                      | high                                       |
| `WidgetConfigActivity`                                                    | placement vs quick-switch vs setup; list filtering by granted ids; save validation                                                                                                                                    | high                                       |
| `DeadlineNotificationActionReceiver`                                      | HTTP seam + fallback-notification path                                                                                                                                                                                | high                                       |
| `RescheduleActivity`                                                      | HTTP seam; shortcut math, custom picker, notification reschedule, fallback                                                                                                                                            | high                                       |
| `MainActivity` + `RefreshGestureAwareLayout`                              | extracted touch-heuristics and route-helper tests; the Capacitor `Bridge` `onCreate` wiring is a justified exclusion (needs a real Bridge)                                                                            | medium                                     |
| `MaxHeightScrollView`                                                     | `onMeasure` EXACTLY/AT_MOST/UNSPECIFIED                                                                                                                                                                               | low                                        |
| `WidgetApiClient` PATCH                                                   | close the documented gap via the HTTP seam                                                                                                                                                                            | medium                                     |

### Gate

- Raise `minimum` in `apps/android/app/build.gradle` to just under the measured line coverage
  (never above it), with a comment naming any remaining excludes and their justification. Raise
  further in later PRs if coverage grows; never lower it silently.

## PR 2 — iOS + desktop

### iOS

- Add an `AppTests` target and a shared scheme to `apps/ios/App/App.xcodeproj/project.pbxproj`
  (there is none today). XCTest cases for `SpaFallbackRouter.route` (extensionless → `200.html`;
  real asset paths pass through) and, if cheap, `MainViewController`'s paper/ink colour helpers.
- Add a small `ios` job to `.github/workflows/test.yml` (`macos-latest`, `xcodebuild test` on a
  Simulator destination). `AppDelegate`/`SceneDelegate` remain excluded as boilerplate.
- If the macos runner cost proves unacceptable on every PR, run it only from `ios-build.yml` and
  record the loss of PR gating.

### Desktop

- Move every branch out of `main.cjs`/`preload.cjs` into `lib/*.cjs` — window-state clamping,
  the tray/background-run decision, external-link and navigation guards, the second-instance/lock
  handling, and error logging — each at 100% via the existing `vitest.config.ts`. This is the same
  pattern the config/`background-run`/`window-state` modules already follow.
- Shrink and re-justify the `exclude: ['main.cjs', 'preload.cjs']` list once the residual wiring is
  genuinely branch-free. Optionally add a headless `_electron.launch()` boot→window→quit smoke test
  if it proves stable.

## PR 3 — Docs, AGENTS.md, and this plan's follow-ups

- Update `docs/development/testing.md` (add Android Robolectric + iOS XCTest + desktop coverage and
  the raised gate), `docs/android-ios.md`, `README.md`'s test line, and `AGENTS.md`'s Android
  paragraph (ratchet number, Robolectric, iOS target, and the manual-instrumented caveat).
- Record a matching note in the OpenChamber project knowledge.

## Out of scope

- No 100% parity push on the native shells; no emulator/device CI job or instrumented-coverage
  merge (JVM-only in CI; `QuickAddLayoutTest` and future gesture/trampoline tests stay manual).
- No behavioural change to widget/notification/app code — extractions and seams only.
- `AppDelegate`/`SceneDelegate` boilerplate and remaining true Capacitor-Electron wiring stay
  excluded with justification.

## Verification

- `pnpm check` — the Android Gradle step now runs Robolectric tests plus the raised JaCoCo gate
  (present in `scripts/check.mjs`; skipped only when no SDK/JDK is available).
- `pnpm --filter @everylist/desktop test` — new `lib/` modules at 100%.
- iOS: `xcodebuild test` on macOS (CI `ios` job).
- After each Android change, a manual on-device pass of the widget quick-add and deadline
  notification flows, using `adb install` + `adb shell am instrument` rather than
  `connectedAndroidTest` (which uninstalls the app and wipes its data — see AGENTS.md).
- Lint/typecheck clean on every PR; the coverage gate is only ever raised.

## Risks

- **Robolectric + JaCoCo** on-the-fly instrumentation must aggregate into `testDebugUnitTest.exec`;
  fall back to offline instrumentation if not.
- **Robolectric SDK 36 support** — pin a compatible release or down-level per-class with
  `@Config(sdk = …)`.
- **`MainActivity`/`BridgeActivity`** is likely genuinely untestable on the JVM; it becomes a
  justified exclusion, not a reason to lower the gate.
- **iOS CI cost** on every PR — mitigate by scoping the job or moving it to the iOS release
  workflow with a documented trade-off.
