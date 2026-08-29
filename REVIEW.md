# REVIEW.md

Guidance for the automated reviewer (Kilo Code) on PRs in this repo. See [`AGENTS.md`](AGENTS.md) for everything else agent-facing — this file is scoped to review policy only, not general conventions.

EveryList is a self-hosted, offline-first shared-list app with no staging environment (see AGENTS.md's Working conventions) — a bad change on `main` reaches production on the next deploy, and a bad migration reaches real users' data with no rollback safety net beyond the migration file itself. Review accordingly: this is a small solo-maintained app, not an enterprise codebase, so most things should be lgtm — but the handful of areas below are where a mistake is expensive.

## What matters in this repository

- **List access control.** Every list read/write must go through the grant/ownership check in `apps/api/app/policies/list_policy.ts` (or the equivalent client-side guard for the widget/native paths — see `WidgetPrefs.getGlobalListIds`, the granted-list-id source `WidgetConfigActivity` filters against). A query or route that reaches list/item data without going through that check is the closest thing this app has to a tenant-isolation bug.
- **Secrets and tokens never in a loggable place.** PATs and session tokens must never end up in a URL, query string, or log line — see the Android widget code's comments on why the config handoff writes tokens to SharedPreferences instead of passing them through an `Intent` URI. Flag any new code path that puts a token somewhere it could be logged or appear in a URI.
- **Migrations are one-way in production.** No staging environment means a migration either works the first time or it's a manual data-recovery problem. Pay special attention to `ALTER TABLE` combined with `PRAGMA foreign_keys=ON` (documented data-loss footgun in AGENTS.md) and to `this.schema.createTable` + same-migration data inserts (must go through `this.defer()`, also documented).
- **Realtime sync and offline-first correctness.** This app's core value proposition is multi-device sync that works offline and reconciles cleanly. Changes touching the SSE broadcast path, the offline queue, or conflict resolution deserve more scrutiny than average — these are the parts most likely to fail silently and be noticed by a user, not CI.
- **Prefer small, explicit fixes over broad refactors.** Especially in the native Android/iOS shells, where a "cleaner" refactor can silently violate a platform constraint that isn't obvious from reading the diff alone (see the native-shell section below).

## Severity calibration

- **Critical:** data loss (especially via migrations), a list access-control bypass, a token/secret exposed in a log or URI, a change that would corrupt or desync offline-stored data.
- **Warning:** a missing validation at a trust boundary (API route, IPC/plugin bridge, config loading), an untested edge case in business logic, a realtime/offline code path that isn't covered by the E2E suite.
- **Suggestion:** style/structure judgment calls, naming, test quality that isn't actively wrong, anything where the "right" answer is genuinely a matter of taste.
- **Don't flag:** formatting or lint-shaped issues already caught by tooling (see below), and the specific known-flaky CI patterns documented in AGENTS.md (offline-sync and sortable-prototype E2E tests both have a documented intermittent-duplicate-row failure mode that is CI-only and not caused by the PR under review — don't treat a rerun-fixes-it failure on those two suites as a new bug unless the PR touches that code path directly).

## Don't duplicate CI

`pnpm check` (see AGENTS.md) already runs lint, typecheck, and every workspace's coverage-gated test suite (100% coverage enforced for `packages/shared` and `apps/api`) plus the Playwright E2E suite; `.github/workflows/ci.yml` runs the same gate plus a Docker image smoke test. Don't comment on anything that gate would already catch and report directly — lint/format violations, type errors, failing tests, coverage regressions. If the only thing you'd raise is one of those, just say `lgtm`.

## Verification expectations

- New business rules (list/item mutation logic, sync/conflict resolution, access grants) need a test that asserts the observable behavior, not just that a function was called.
- A migration that changes an existing table's shape should be reviewed for what happens to existing rows, not just new ones — this app has no seed/staging data to catch that in advance.
- UI changes should preserve keyboard and screen-reader behavior; don't wave through a new interactive element with no focus/label story.
- Android/iOS native changes should be described as verified live (device or emulator), not just "should work" — this repo's history includes several bugs (widget crash loops, dead taps, a popup pulling the whole app to the foreground) that passed code review and CI but only showed up when actually exercised on-device. A native-UI PR description that doesn't mention on-device verification is worth a comment.

## Native shell (Android widget / Capacitor) — things that look wrong but aren't, and things that look fine but aren't

This app's Android home-screen widget has hit several genuine, non-obvious platform constraints. Know these before flagging them:

- A `RemoteViews` collection row (`ListView`/`GridView`) that uses `setOnClickFillInIntent` on **both** a container view and a view nested inside it will silently drop clicks on the outer one — they must be siblings, not parent/child. This is correct, deliberate structure in `widget_everylist_item.xml`, not a mistake.
- A `PendingIntent` passed to `RemoteViews#setPendingIntentTemplate` (used with per-row `setOnClickFillInIntent`) **must** be `FLAG_MUTABLE`, unlike the general Android 12+ guidance to prefer `FLAG_IMMUTABLE` everywhere. An immutable template silently no-ops every row tap with no crash and no log line. Don't suggest "should this be `FLAG_IMMUTABLE`" on that specific call site.
- `WorkManager.enqueue()` from a widget's `BroadcastReceiver` has a real, reproduced side effect in this app's history: it toggles WorkManager's own `RescheduleReceiver` component, which triggers `PACKAGE_CHANGED`, which some launchers answer by re-broadcasting `APPWIDGET_UPDATE` — a self-sustaining render loop. `WidgetUpdater`/`EveryListWidget` deliberately use `BroadcastReceiver#goAsync()` instead. Don't suggest reintroducing WorkManager for widget background work without flagging this history.
- An `Activity` launched from a widget tap that's meant to feel like a popup (not a full-screen page) needs `android:taskAffinity=""`, or it inherits the app's default task affinity and — if the app already has a backgrounded task — gets attached to it, pulling the whole app to the foreground underneath the popup. `WidgetConfigActivity` relies on this; flag its removal.
- `RemoteViews` layouts only support a fixed allow-list of view classes — plain `<View>` is **not** one of them (`InflateException: Class not allowed to be inflated android.view.View`, hit and fixed in this repo). A divider or spacer in a widget layout must use `FrameLayout` or another allowed class, not `View`.

## How to comment

- Leave comments on the exact line via the PR review API, not as a single summary dump — the human (or an agent acting for them) needs to be able to reply to and resolve each one individually.
- Frame findings as suggestions the human can accept or reject, not mandates — this is a solo-maintained hobby-scale app, not a team with a style guide to enforce.
- Every thread you open is expected to get a reply and be marked resolved before the PR merges — if you don't hear back before merge, that's a process gap on the human/agent side, not a reason to keep re-flagging the same finding across every subsequent commit's summary. Track it as one open issue per PR, not one per commit.
- If the PR is clean against everything above, say `lgtm` and nothing else.
