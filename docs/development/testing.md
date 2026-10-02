# Testing

- **Backend:** `pnpm --filter @everylist/api test` (Japa, with `c8` coverage gated at 100%)
- **Frontend:** `pnpm --filter @everylist/web test` (Vitest + Testing Library, 100% coverage gate; Playwright for E2E)
- **Shared:** `pnpm --filter @everylist/shared test` (Vitest, 100% coverage gate)
- **CLI:** `pnpm --filter @everylist/cli test` (Vitest, 100% coverage gate; every command runs against a fake API client, so no network/TTY is touched)
- **Desktop:** `pnpm --filter @everylist/desktop test` (Vitest, 100% coverage gate on `lib/`; the Electron wiring in `main.cjs`/`preload.cjs` keeps only event dispatch and null guards — every real decision lives in the tested `lib/`)
- **Android:** `cd apps/android && ./gradlew :app:jacocoTestReport` (Gradle + Robolectric, with a line-coverage ratchet — see `apps/android/app/build.gradle`). Robolectric runs the widget, its popups, its receivers and the Capacitor plugins on the JVM, so this needs an Android SDK + JDK 17+ but no emulator. `scripts/check.mjs` runs it as part of `pnpm check` and skips it with a note when that toolchain is absent. The instrumented `QuickAddLayoutTest` still needs a device/emulator and is run by hand, not in CI.
- **iOS:** the `EveryListTests` XCTest target, run on a macOS runner by the `ios` job in CI (`scripts/ios-test.mjs`, which picks an available iPhone Simulator via `simctl` rather than pinning a device name). It covers the pure helpers extracted out of the shell (`SpaFallbackPath.swift`, `ThemeColors.swift`). `scripts/check.mjs` runs the same step on macOS and skips it elsewhere.

CI (GitHub Actions) runs lint → typecheck → tests/coverage → Docker build → E2E smoke on every PR; see [`.github/workflows`](../../.github/workflows).
