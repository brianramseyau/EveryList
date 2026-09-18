# Phase 28 — Reschedule Overlay for the Deadline "Snooze" Action

## Context

Add-on to PLAN_26 (deadline notifications): the deadline notification's "Snooze 1 hr" action
instantly pushed an item's deadline forward one hour with no UI. Replaced with a "Reschedule"
action that opens a shortcut-picker overlay — modeled on the Android widget's "+" quick-add popup
(PLAN_18's `QuickAddActivity`, a small floating dialog that appears instantly rather than
cold-launching the app) — offering: **1 hour** (only when the item's deadline has a specific time
set), **Tomorrow**, **This weekend**, **Next week**, and **Custom** (an exact date/time).

This touches all three existing snooze implementations (PWA service worker, Capacitor
native/iOS, Android background receiver), each of which independently duplicated the old +1hr
math, plus a new Android popup Activity to preserve the "instant popup, no app launch" feel the
widget's quick-add already established. No backend/API/DTO changes were needed — every path ends
in the same existing `PATCH /api/v1/lists/:id/items/:itemId` with `{ deadline }`, already generic.

## Shared date-shortcut math

Three new functions in `apps/web/src/lib/deadline.ts`, alongside the existing
`addHoursToDeadline` (kept, now only used for the "1 hour" shortcut):

- `tomorrowDeadline(deadline, now)` — tomorrow's calendar date, keeping the deadline's
  time-of-day if it had one, else date-only.
- `thisWeekendDeadline(deadline, now)` — the coming Saturday, or today if today is already
  Saturday/Sunday.
- `nextWeekDeadline(deadline, now)` — next Monday, always a future date even if today is Monday.

These three are only needed client-side in the SvelteKit app and in Android's native popup — not
in `push-sw.js`, since the PWA path now opens the app to show the overlay instead of computing
anything in the service worker. So there's no new service-worker duplication for these three; only
`addHoursToDeadline` remains duplicated (unchanged) in `push-sw.js` and `DeadlineMath.java`.
`DeadlineMath.java` also gained Java ports of the three new shortcuts (`tomorrowDeadline`,
`thisWeekendDeadline`, `nextWeekDeadline`), with parity test vectors in `DeadlineMathTest.java`
matching `deadline.spec.ts`.

## New Svelte overlay component

`apps/web/src/lib/components/RescheduleOverlay.svelte` — modeled on `ConfirmDialog.svelte`'s
shell (backdrop, centered card, `alertdialog` role, focus restore, outside-click/Escape dismissal)
with a vertical list of shortcut buttons instead of two confirm/cancel buttons. "1 hour" only
renders when the deadline has a time. "Custom" reveals inline date/time inputs (same pattern as
`ItemFields.svelte`). Applying any option calls `updateItem(listId, itemId, { deadline })` then
`resyncDeadlineNotifications()` if the preference is on — mirroring the item-edit page's own
`save()`.

## Web/PWA wiring

- `apps/web/src/routes/lists/[id]/items/[itemId]/+page.svelte` reads a `reschedule` query param;
  once the item has loaded, if present (and the item has a deadline), it opens the overlay and
  strips the param via `replaceState` on close so back/refresh doesn't reopen it.
- `apps/web/static/push-sw.js`: the action's title changed from `'Snooze 1 hr'` to `'Reschedule'`.
  `notificationclick`'s `snooze` branch no longer PATCHes directly — it opens/focuses
  `/lists/:listId/items/:itemId?reschedule=1`, the same navigate-or-openWindow logic already used
  for a plain notification-body tap. The service worker's own `addHoursToDeadline` copy (and
  `deadline-sw-parity.spec.ts`, which existed only to pin it) was removed as dead code.

## Native (iOS + Android-in-app JS layer)

`apps/web/src/lib/notifications/native.ts`:

- The "Reschedule" action's `foreground` flag is now platform-conditional:
  `Capacitor.getPlatform() === 'ios'`. On iOS this brings the app forward so the overlay can show
  (iOS has no equivalent of Android's background-receiver popup). On Android it **stays `false`**
  — that's what makes the OS route the tap to `DeadlineNotificationActionReceiver` (a patched copy
  of `@capacitor/local-notifications`, see `patches/`), which now launches the native popup
  Activity below instead of the old instant background PATCH.
- `snoozeFromNotification` (the old instant +1hr background action) was removed.
  `listenForNativeDeadlineActions` gained an `onReschedule` callback (parallel to `onTap`),
  invoked for the Reschedule action — in practice only ever fires on iOS, since Android bypasses
  this JS listener entirely for that action.
- `+layout.svelte` wires `onReschedule` to navigate to the item with `?reschedule=1`, same guard
  (`if (!loggedIn) return`) as `onTap`.

## Android

Mirrors `QuickAddActivity`'s "instant popup over whatever's on screen" pattern so tapping
Reschedule stays fast (no WebView/app launch):

- New `RescheduleActivity` (`AppTheme.WidgetDialog` theme, `exported="false"`, no intent-filter,
  `taskAffinity=""`, `excludeFromRecents="true"` — same manifest shape as `QuickAddActivity`).
  Authenticates via `AuthPrefs` (the app-session mirror, not `WidgetPrefs`'s widget-scoped PAT).
  On create, fetches the item's *live* deadline (`GET .../items`, same as the old receiver-side
  snooze logic) off the main thread to decide whether to show "1 hour" and as the base for the
  other shortcuts. Each shortcut PATCHes the new deadline and best-effort reschedules the
  follow-up local notification, mirroring what `DeadlineNotificationActionReceiver`'s `snooze()`
  used to do before this Activity existed. "Custom" chains a `DatePickerDialog` then a
  `TimePickerDialog` (with a "No time" button on the time dialog for a date-only pick). Any
  failure shows the same fallback notification pattern already used elsewhere
  ("Couldn't update the item — open the app and try again.") and finishes.
- `DeadlineNotificationActionReceiver`'s `"snooze"` branch now just launches `RescheduleActivity`
  (`FLAG_ACTIVITY_NEW_TASK`, carrying `listId`/`itemId`/the original notification JSON as extras)
  instead of handling it directly — its own `snooze()`/`findItemDeadline()`/
  `rescheduleNotification()` methods were removed (moved into `RescheduleActivity`). It still
  handles `"complete"` directly in the background, unchanged.
- New layout `res/layout/reschedule.xml` (modeled on `quick_add.xml`) and a new bordered/ripple
  background drawable (`reschedule_option_background.xml`) for the shortcut rows.

## Out of scope

- No persistent "Reschedule" entry point inside the app's own item-edit UI — the overlay is only
  reachable via the notification action's `?reschedule=1` deep link, matching what was asked.
- The "Complete" notification action is unchanged on every platform.

## Verification

- `pnpm --filter web test`, `pnpm lint`, `pnpm typecheck` — all green, 100% coverage maintained.
- `./gradlew testDebugUnitTest` (Android, `DeadlineMathTest`'s new parity vectors) and
  `./gradlew compileDebugJavaWithJavac` — both green.
- Not exercised in this environment: an actual on-device/emulator run of the Android popup and the
  receiver's routing change, and a live Web Push "Reschedule" tap end-to-end. Needs manual
  verification before merging, per this repo's own "reproduce live" guidance.
