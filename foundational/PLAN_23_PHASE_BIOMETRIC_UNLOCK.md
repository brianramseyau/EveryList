# Phase 23 — Biometric Unlock for Passcode-Protected Lists (native Android + iOS)

## Context

List passcodes (see `foundational/PLAN_07_PHASE_POLISH.md` §2) are a pure client-side gate: SHA-256(salt+pin) compared locally in `apps/web/src/lib/passcode.ts`, with `PasscodeGate.svelte` calling `onunlock()` on a match, and `routes/lists/[id]/+page.svelte` owning the `unlocked` state (re-locks on `visibilitychange`). Native biometrics return a yes/no "user authenticated" result, so biometric success maps to exactly the same `onunlock()` — no new unlock mechanism, just a second way to produce the one existing unlock signal.

No API/DTO/server changes, no `.adonisjs/` regen (no route changes), **no migration** — the passcode hash is already stored on the `ListDto` and everything stays client-side.

## Locked decisions

- **Plugin:** `@aparajita/capacitor-biometric-auth` (MIT, Capacitor 8, Android + iOS, web simulation for tests). NOT `@capawesome-team/capacitor-biometrics` (paid) or `capacitor-native-biometric` (stale).
- **Auto-prompt once per gate appearance** (initial open AND after a background re-lock); user cancel falls back silently to the PIN form and suppresses further auto-prompts until the next re-lock; hard failure shows an error message + PIN form.
- **Always offered when the device has enrolled biometrics** — no opt-in toggle.
- **`allowDeviceCredential: false`** — the device PIN/pattern never unlocks a list passcode; the list PIN stays the fallback credential.
- **Shared-device multi-biometry is NOT a covered use case** for this app — noted as out of scope by design in the module header, nothing more.
- **Web/PWA/Electron (non-Capacitor): behavior unchanged, PIN only.** Everything is gated on `Capacitor.isNativePlatform()`.

## Scope

### 1. `apps/web/package.json` — plugin dependency

Add `@aparajita/capacitor-biometric-auth` as a dependency of `apps/web`.

### 2. `apps/web/src/lib/biometrics.ts` (new)

Mirrors `lib/orientation.ts`'s conventions exactly: `hasWindow()` guard, `Capacitor.isNativePlatform()` gate, never-throw typed results, static plugin import wrapped in the `/* v8 ignore start/stop */` coverage-attribution comments (see `orientation.ts` lines 2–8 for why that treatment exists).

Exports:

- `checkBiometry(): Promise<{ available: boolean }>` — `false` on web / no-window / error. (`available: boolean` is the contract callers key on; the type carries the plugin's biometry type as additional data so the gate can adapt its copy — fingerprint / Face ID — without any second call.)
- `authenticateWithBiometrics(reason: string): Promise<'success' | 'cancelled' | 'failed' | 'unavailable'>` — maps `userCancel`/`appCancel`/`systemCancel` to `'cancelled'`, any other `BiometryError` to `'failed'`; `'unavailable'` covers web / no-window / not-enrolled before a prompt is ever attempted.

Module header notes shared-device multi-biometry is out of scope by design. Doc-comment style follows `orientation.ts`.

### 3. `apps/web/src/lib/components/PasscodeGate.svelte` — auto-prompt

On mount: if native + enrolled, auto-prompt after a short delay so the WebView is interactive before the native sheet appears. Outcome handling:

- `success` → `onunlock()`.
- `cancelled` → PIN form, silent (no error text).
- `failed` → error text + PIN form.
- Prompt copy adapts to biometry type (fingerprint / Face ID).

The PIN form remains the universal fallback. **Do not touch the parent page's `unlocked`/`visibilitychange` logic** — `PasscodeGate` is remounted by `[id]/+page.svelte`'s `{#if list.passcodeHash && !unlocked}` on every re-lock, so a fresh instance's `onMount` gives the re-lock re-prompt for free.

### 4. Native manifests

- `apps/ios/App/App/Info.plist`: add `NSFaceIDUsageDescription` (required by Apple whenever Face ID is invoked).
- **Verified:** Android needs no manifest change — but not for the reason first assumed. This plugin's Android side uses `androidx.biometric.BiometricPrompt`, which requires no `USE_BIOMETRIC` permission (that permission is only for the deprecated FingerprintManager path), and the plugin's own `AndroidManifest.xml` declares none — so there is nothing to merge. `cap sync` registration (Gradle `settings.gradle`/`build.gradle` + iOS SPM `Package.swift`) is the only native-project change.

## Tests (100% coverage gates apply on `apps/web`)

- `apps/web/src/lib/biometrics.spec.ts` (new) — mock the plugin: native/web/no-window matrix, every outcome mapping, never-throws on plugin errors.
- Extend `apps/web/src/lib/components/PasscodeGate.svelte.spec.ts` — no prompt on web; auto-prompt on native+enrolled; success unlocks; cancel → PIN form silently; failure → error; re-lock → re-prompt. Same `vi.mock` patterns as `orientation.svelte.spec.ts`. If cross-file `vi.mock` coverage-attribution artifacts appear, use the documented `/* v8 ignore */` treatment, not lowered thresholds.

## Verification

- `pnpm --filter @everylist/web test` (coverage-gated), then `pnpm check --skip-e2e` from repo root.
- `pnpm --filter @everylist/web run cap:sync`; if an Android SDK is available, build `apps/android` (`./gradlew assembleDebug`) and record the result. Gradle/device testing may have to be left as manual steps if no SDK is present — stated explicitly when so.

### Manual device-test steps remaining

1. Enrolled-fingerprint unlock (Android).
2. Cancel at the biometric prompt → PIN form, no error shown.
3. Background the app while unlocked → re-lock → biometric re-prompt on return.
4. iOS simulator Face ID enroll + unlock (Feature → Face ID → Enrolled in the simulator menu).

## Explicitly out of scope (do not touch)

- Widget/Alexa/export paths reading list contents without the PIN (pre-existing by design).
- Desktop app stays PIN-only.
