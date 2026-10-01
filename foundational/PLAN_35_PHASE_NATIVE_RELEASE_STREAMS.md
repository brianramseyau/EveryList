# Phase 35 — Independent release streams for the native apps

## Context

Every release today is one git tag (`vX.Y.Z`), and one workflow set reacts to it:

- `docker-publish.yml` publishes the server image (server = `apps/api` + the `apps/web` bundle +
  `packages/shared`).
- `native-build.yml` builds and publishes **all three** native artifacts — the Android AAB to Play,
  the iOS Simulator app, and the three desktop installers — and attaches them to the same GitHub
  Release.
- `scripts/prepare-release.mjs` refuses to run without an `apps/android/CHANGELOG.md` entry whose
  newest heading matches the tag, because that entry becomes the Play "What's new" text.

The consequence surfaced on **v1.8.0** (2026-10-01), a release whose entire content was server-side
(MCP #275, CLI #276, API contract versioning #278). It still built and submitted an Android AAB to
Play, rebuilt and attached iOS/desktop installers, and — because of the changelog gate — had to
author a Play "What's new" note for features that never touch the Android app. `prepare-release`
would have aborted without it. That is the single train forcing unrelated artifacts to ship.

The artifacts are not actually coupled:

- **Android** (`apps/android`) has bespoke Java that ships on its own store cadence (Play review,
  staged rollout, `versionCode` monotonicity). Its version is currently _derived from the server
  tag_, which is why a server-only release has to invent an Android release.
- **iOS** (`apps/ios`) has a Swift shell and is not distributed at all yet (no Apple Developer
  enrollment — unsigned Simulator builds only). Its `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`
  are hard-coded (`1.0` / `1`) and not driven by any tag, so it has no real version today.
- **Desktop** (`apps/desktop`) is a pure Electron wrapper with no native modules (PLAN_22 §6): it
  embeds the exact `apps/web` build and injects the release tag as its version. It has no
  independent surface, so it should stay bound to the web/server stream.
- **Server/web/shared** are genuinely one artifact: the Docker image serves the web build, and
  `packages/shared` is compiled into both. They stay on `vX.Y.Z`.

This phase splits the release train so each native app releases on its own cadence, and stops the
server train from forcing native builds or a Play note.

Decisions locked:

- **Three release streams.** Server/web/desktop keep `vX.Y.Z`; Android gets `android-vX.Y.Z`; iOS
  gets `ios-vX.Y.Z` (pre-releases: `android-vX.Y.Z-rc.N`, `ios-vX.Y.Z-rc.N`). Each stream owns its
  version numbers, its changelog, its workflow trigger, and its GitHub Release.
- **Desktop stays bound to web.** It is bundled web with an injected version; it rides `vX.Y.Z`
  exactly as today, builds on server tags, and needs no version of its own. The one thing this
  _does_ break is its update check (below), which must be fixed in the same phase.
- **No automatic cross-stream numbering.** Android and iOS track their own semver; they are not
  required to match the server version. Android's stream continues from where the old shared train
  left it (starts at `1.8.1`) so Play's `versionCode` stays monotonic — see Migration.
- **Releases stay deliberate.** A stream only releases when a human cuts its tag. Path-based
  triggers are for _verification_ (PR CI), not publishing — publishing on "the diff happened to
  touch apps/android" would make Play submissions a side effect of merging.

## The GitHub Release namespace problem (fix this first)

Desktop's update check (`apps/desktop/lib/update-check.cjs`) fetches
`api.github.com/repos/.../releases/latest` and compares `tag_name` against its own version. Once
`android-vX.Y.Z` and `ios-vX.Y.Z` releases exist, `releases/latest` returns whichever stream
released **most recently by date**, which can be an Android release — and desktop would report
"update available" pointing at an Android AAB. This is the "something you might be missing" about
"desktop just bundles web": it bundles web, but it _reads the repo's release list to update itself_,
and that list stops being unambiguous the moment there is more than one stream.

Fix, in this phase:

- `checkForUpdate` switches from `releases/latest` to `releases?per_page=100`, filters to tags
  matching the **server** pattern (`^v\d+\.\d+\.\d+$`, i.e. a leading `v` and no stream prefix),
  ignores drafts/prereleases, and picks the highest by `parseVersion`. `apps/desktop/lib/update-check.spec.cjs`
  gains cases for: an Android release newer than the server release (ignored), a prerelease server
  tag (ignored), and no server release found (error).
- `docs/desktop.md` and `apps/desktop/lib/update-check.cjs`'s doc comment state that the check is
  scoped to the server stream, not "the latest release, whatever it is".

Nothing else consumes `releases/latest` (grep confirms: desktop's check and its tests only). The
web Settings "check for update" flow calls the same desktop IPC handler, so it inherits the fix.

## Per-stream design

### Server / web / desktop — `vX.Y.Z` (unchanged tag, changed workflow split)

- `docker-publish.yml` is untouched: it keys off `v*.*.*`, publishes the multi-arch image, and its
  `bump-ha-addon` job keeps bumping `everylist-ha-app` from the image tag.
- The **desktop** build/release jobs move out of `native-build.yml` into their own `desktop-build.yml`
  triggered on `v*.*.*` (still only `apps/desktop` + the web bundle; version injected from the tag).
  This keeps "server release ⇒ desktop installer" true while letting `native-build.yml` retire.
- Today `native-build.yml`'s single `release` job attaches every artifact to the one tag-triggered
  GitHub Release via `softprops/action-gh-release` (which creates the release if absent). Once split,
  **each** of `desktop-build.yml`, `android-build.yml`, `ios-build.yml` carries its own
  release-attach job scoped to its own tag, so no workflow touches another stream's release.
- `scripts/prepare-release.mjs` keeps its current behaviour for `root`/`apps/web`/`apps/desktop`/
  `apps/cli` (always sync to the tag) and `apps/api`/`packages/shared` (Phase 34 change-driven), and
  **drops the `apps/android/CHANGELOG.md` gate** — that gate moves to the Android stream. Its
  "refuse unless the Android entry exists" behaviour is what forced the v1.8.0 Play note.
- Server GitHub Release notes cover server/web/desktop only; native notes live on their own releases.

### Android — `android-vX.Y.Z`

- **Version source:** a checked-in `apps/android/version.properties` (`versionName=X.Y.Z`,
  `versionCode=N`) becomes the Android-owned source of truth, replacing "parse the repo tag".
  `versionCode` is written explicitly (Android requires it to strictly increase); `versionName` is
  the android semver. `apps/android/app/build.gradle` reads it as the default, and CI no longer needs
  to inject `-PappVersionCode`/`-PappVersionName` (it may still override for rc builds, or the
  formula in the workflow can derive the rc code from `versionCode`). Keeping the file explicit
  removes the `MAJOR*1e6+…` coupling to the _server_ tag.
- **Changelog / Play notes:** `apps/android/CHANGELOG.md` stays Android's changelog, and
  `scripts/android-whats-new.mjs` keeps extracting the newest entry — but it is now validated
  against the **android** version, not the server tag. Entries remain plain `## vX.Y.Z` headings
  matching the android version (Android has its own file, so there's no collision with server
  headings).
- **Tooling:** new `scripts/prepare-android-release.mjs` (`pnpm prepare-android-release android-vX.Y.Z`):
  validates that `apps/android/CHANGELOG.md`'s newest entry matches `X.Y.Z` and has a valid What's
  new block, then writes `apps/android/version.properties`. It does not touch any other workspace.
- **Workflow:** `native-build.yml` is replaced by `android-build.yml`, triggered on
  `android-v*.*.*`:
  - `android-vX.Y.Z-rc.N` → debug-signed APK, attached to a prerelease GitHub Release (sideload),
    same as today's rc path.
  - `android-vX.Y.Z` → release-signed AAB → Play closed-testing/alpha, plus a GitHub Release
    carrying the AAB and the Android notes.
  - The `prune-prereleases` job moves here and prunes only `android-vX.Y.Z-rc.*` for the same
    android version.
  - The web bundle embedded by an Android build is whatever is on the android tag's commit; the
    release notes should record the server version it embeds (read from root `package.json`) so it's
    clear which web features a given Android build carries.
- **PR verification:** already covered — `test.yml`'s `android` job runs `cap:sync` then
  `./gradlew :app:jacocoTestReport :app:compileDebugAndroidTestJavaWithJavac` on every PR, so Gradle
  compiles Android changes before a tag exists. No new CI step is needed; this phase only changes
  what the tag build does (which version it stamps, which track it publishes to).

### iOS — `ios-vX.Y.Z`

- **Version source:** `MARKETING_VERSION` (`X.Y.Z`) and `CURRENT_PROJECT_VERSION` (a monotonic build
  number) in `apps/ios/App/App.xcodeproj/project.pbxproj`, driven per release. Deliberately
  _rewritten in place_ rather than moved into a new `version.xcconfig`: adding a config-file
  reference means editing Xcode project structure that can't be validated in this environment (no
  `xcodebuild`), whereas regex-replacing the two existing build settings is exactly the approach
  `prepare-release.mjs` already takes with `package.json`. The plan originally proposed an xcconfig;
  dropped for that reason.
- **Tooling:** `scripts/prepare-ios-release.mjs` (`pnpm prepare-ios-release ios-vX.Y.Z`) rewrites
  those two settings in place. iOS has no store changelog yet (not distributed), so it needs no
  Play-style gate; a short `apps/ios/CHANGELOG.md` can exist for the GitHub Release notes but is not
  required to build.
- **Workflow:** `ios-build.yml`, triggered on `ios-v*.*.*`, builds the unsigned Simulator app and
  attaches it to an `ios-vX.Y.Z` GitHub Release. No App Store step exists until Apple enrollment.
- This is a **preparatory stream**: its value now is (a) stopping iOS from rebuilding on every
  server tag, (b) giving iOS real version numbers so a future TestFlight/App Store release isn't
  starting from `1.0`/`1`, and (c) a place for the Swift shell to evolve without dragging the server
  train.

## Files

New:

- `foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md` (this file)
- `.github/workflows/android-build.yml`
- `.github/workflows/ios-build.yml`
- `.github/workflows/desktop-build.yml`
- `scripts/prepare-android-release.mjs`
- `scripts/prepare-ios-release.mjs`
- `apps/android/version.properties`

Changed:

- `.github/workflows/native-build.yml` — deleted (split into the three above)
- `apps/desktop/lib/update-check.cjs` + `.spec.cjs` — server-stream-scoped release lookup
- `apps/android/app/build.gradle` — read `version.properties` as the default
- `apps/ios/App/App.xcodeproj/project.pbxproj` — `prepare-ios-release` rewrites the version settings
  in place (the initial checked-in values are unchanged; only a release run moves them)
- `scripts/android-whats-new.mjs` — validate against the android version; accept the stream tag
- `scripts/prepare-release.mjs` — drop the Android changelog gate
- `package.json` — `prepare-android-release` / `prepare-ios-release` scripts
- `AGENTS.md` — release section: three streams, their tag shapes, and the per-stream steps
- Docs that currently say "every `vX.Y.Z` tag attaches Android/iOS/desktop builds" become wrong and
  must be updated: `README.md` (the "Native apps" and desktop paragraphs), `docs/android-ios.md`
  (line 3), `docs/desktop.md` (line 3 — still true for desktop, but clarify it's the server stream).
  `docs/cli.md` doesn't reference releases.

## Migration

- **Android continues from `1.8.0`.** The last shared-train Android release was `v1.8.0`, whose AAB
  has `versionCode = 1*1e6 + 8*1e4 + 0*100 + 99 = 1_080_099`. The first Android-stream release is
  `android-v1.8.1` (`versionCode` 1_080_199) — strictly greater, so Play still treats it as an
  update. Do **not** restart Android at `1.0.0`; that would be a downgrade Play rejects.
- **iOS has no constraint** (nothing shipped): start its stream at whatever is sensible — `ios-v1.0.0`
  or continue at `ios-v1.8.1` for symmetry. The plan recommends `ios-v1.8.1` so the two native
  streams start aligned with each other even though they need not stay aligned.
- **Server** is unaffected; `v1.8.0` was already tagged and shipped.
- The first Android-stream release re-ships the web bundle as of its own commit; note the embedded
  server version in its release notes.

## Verification

- `apps/desktop` unit tests: new `update-check` cases (android tag newer than server, prerelease
  server tag ignored, none found) pass, and the desktop check still finds `vX.Y.Z` releases.
- Dry-run each prepare script on a scratch branch: `prepare-release v1.8.1` no longer needs an
  Android entry; `prepare-android-release android-v1.8.1` writes `version.properties` and validates
  the android changelog (and refuses a non-increasing versionCode); `prepare-ios-release ios-v1.8.1`
  rewrites the pbxproj version settings (and refuses a non-increasing build number).
- Both native build workflows assert the checked-in version matches the pushed tag before building,
  so a tag cut without running its prepare script fails fast instead of shipping a build whose
  embedded version contradicts its release tag.
- Push an `android-vX.Y.Z-rc.N` tag from a scratch fork (or run the workflow via `workflow_dispatch`
  if added) and confirm it builds only Android, not iOS/desktop, and creates an android-only release;
  same for `ios-v…`; confirm a `vX.Y.Z` tag builds server image + desktop only.
- Confirm the tag filters don't cross streams. GitHub matches a `tags:` filter against the whole
  ref, so `docker-publish.yml`'s existing `v*.*.*` already excludes `android-v…`/`ios-v…` (they
  don't begin with `v`) — checked with a glob expansion, not assumed, but re-check after editing the
  workflows. Symmetrically, `android-build.yml` (`android-v*.*.*`) and `ios-build.yml`
  (`ios-v*.*.*`) must not fire on plain `vX.Y.Z`. Note `v*.*.*` _does_ match `vX.Y.Z-rc.1` /
  `vX.Y.Z-beta.1`, which is why docker-publish's prerelease handling exists and is unchanged.
- `pnpm check` clean; no workspace version-bump regressions.

## Risks / notes

- **Play versionCode is the one irreversible mistake.** If the first Android-stream `versionCode` is
  not strictly greater than `1_080_099`, Play rejects the upload and recovery is awkward. The
  migration section is the guard; the prepare script should assert monotonicity against the previous
  value in `version.properties`.
- **Two release cadences to remember.** Cutting a server release no longer ships native fixes, and
  vice versa. `AGENTS.md` must make the three streams and their tag shapes unmistakable, or a fix
  will sit merged-but-unreleased because no one cut its stream.
- **Web features reach natives only when the native stream releases.** That is the point, but it
  changes expectations: a server/web change no longer reaches Android/iOS until an `android-v…`/
  `ios-v…` tag is cut. Users on the PWA get it immediately; native users wait for the store release.
- **iOS stream is mostly structural for now** — no store, no device build. Worth doing because the
  alternative (leave iOS on the server train) keeps rebuilding it pointlessly and leaves it
  unversioned.

## Deliberately deferred

- **Web as its own stream.** Rejected: web ships inside the server image and inside every wrapper;
  a separate web version would be a label with no independently shippable artifact.
- **Automated native releases on path change.** Rejected above — publishing to Play as a side effect
  of a merge is not a release process.
- **A compatibility handshake between app and server versions.** The server already exposes
  `/api/v1/meta`'s `apiVersion` and `version` (Phase 34); a native "minimum supported server" check
  can build on that later if a break ever needs it. Not needed to decouple release cadence.
- **TestFlight / Play production tracks.** Out of scope; this phase only reshapes the release
  streams, not the store tracks they publish to.
