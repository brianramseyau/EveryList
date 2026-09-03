# Phase 26 — Deadline Notifications

## Context

Add-on to PLAN_24 (per-item deadlines): notify at an item's due date/time,
across the PWA, native (iOS/Android via Capacitor), and Electron desktop app.

Confirmed with the user:

- **Timing reference**: the server's own local clock, for the Web Push path.
  Deadlines are naive local-time strings with no stored timezone (PLAN_24),
  so a server-driven scheduler can't know each recipient's timezone. This is
  correct for the realistic self-hosted deployment (one household, one
  timezone) and carries the same cross-timezone caveat PLAN_24 already
  documents. Native/Electron local scheduling uses each device's own clock,
  which is actually more correct per-user — a documented inconsistency
  between the two delivery mechanisms, not a bug.
- **PWA**: self-hosted Web Push (VAPID) so notifications fire even with the
  app/tab fully closed. No third-party account needed — VAPID keys are
  generated once and stored in the database.
- **Native**: on-device local scheduling (`@capacitor/local-notifications`),
  not true push — avoids requiring Apple Developer/Firebase credentials in a
  self-hosted app. The OS holds the schedule even after the app is killed.
- **Electron**: no viable Web Push path without external FCM wiring, so it
  gets the same local-scheduling approach as native, driven by a
  `setInterval` in the renderer. Since Electron quits on window close by
  default, this feature also adds a tray icon + "keep running in background"
  behavior, **opt-in, tied to the notifications toggle** — closing the
  window quits as before unless notifications are enabled.
- **Recipients**: every member of a list who has notifications enabled on at
  least one of their devices — matches the collaborative list model.
- **Scope**: exact due-time notification only, no "remind me N minutes
  before". Out of scope for now, like PLAN_24's own future list.

## Data model (new migration)

Single migration, no inline FK references on any `alterTable` (none needed —
these are all new tables), per the AGENTS.md ALTER-TABLE footgun writeup.

- `push_subscriptions` — `id, user_id` (FK → `users`, cascade),
  `endpoint TEXT UNIQUE`, `p256dh TEXT`, `auth TEXT`, `created_at`. One row
  per browser/device that subscribes to Web Push. Native/Electron never
  write here.
- `deadline_notification_sends` — `id, item_id` (FK → `items`, cascade),
  `push_subscription_id` (FK → `push_subscriptions`, cascade), `sent_at`;
  unique on `(item_id, push_subscription_id)`. Dedup log so the scheduler
  never double-sends to the same device for the same item. Cleared whenever
  that item's `deadline` changes, so a pushed-forward deadline can re-fire.
- `push_settings` — singleton row (id 1, `PushSetting.current()`
  `firstOrCreate` pattern like `BackupSetting`), holding `vapid_public_key`
  / `vapid_private_key`, lazily generated via `web-push`'s
  `generateVAPIDKeys()` on first use. No env var required.

No new column on `items`/`lists` — `items.deadline`, `items.checked`,
`lists.use_deadline`, and `list_members` already carry everything the
scheduler needs.

## Backend (apps/api)

1. **`web-push` dependency.**
2. **`app/services/push_service.ts`** — wraps `web-push`: `sendPush(subscription,
   payload)`; deletes the subscription row on a 404/410 (expired) response.
3. **`app/services/deadline_notification_service.ts`** —
   `sendDueDeadlineNotifications(now)`: items where `list.useDeadline = true`,
   `item.checked = false`, `item.deletedAt` null, and the deadline is due per
   the same string-compare rule as web's `isOverdue` — within a grace window
   (up to ~15 minutes late, absorbing a restart, same tolerance approach as
   `backup_service`; older than that is treated as already-missed, no
   retroactive notification storm on re-enabling the feature). For each due
   item: every list member's `push_subscriptions`, skip rows already in
   `deadline_notification_sends`, send, record the send.
4. **`start/deadline_notification_scheduler.ts`** — same shape as
   `backup_scheduler.ts`: 60s `setInterval`, skipped under `app.inTest` and
   the `console` environment.
5. **`push_subscriptions_controller.ts`** + routes: `POST
   /api/v1/push/subscriptions` (subscribe), `DELETE
   /api/v1/push/subscriptions/:id` (unsubscribe, scoped to the caller's own
   subscriptions — a flat `endpoint` body on `DELETE` collided with the
   Tuyau-generated client types for `POST`'s body at the same URL pattern,
   so unsubscribe is id-based instead), `GET /api/v1/push/public-key` — all
   authenticated except the public key.
6. **Validator** for the subscription payload (`endpoint`, `p256dh`, `auth`
   as flat fields — a nested `keys: { p256dh, auth }` object didn't infer
   cleanly through Tuyau's `InferInput`, so the wire payload is flattened).
7. **`items_controller.ts#update`** — when the payload changes `deadline`,
   delete that item's `deadline_notification_sends` rows so an edited
   deadline can re-fire. No change needed for checked/deleted (the scheduler
   query already excludes them).
8. Regenerate `.adonisjs/` (new routes) per AGENTS.md's `pnpm dev` step, then
   `pnpm typecheck`.

## PWA (apps/web)

1. **Stayed on `generateSW`** (did not switch to `injectManifest` as originally
   planned) — `vite.config.ts`'s existing `generateSW` setup has substantial,
   carefully-earned correctness around precaching prerendered HTML via
   `closeBundle` hook timing and the `200.html` fallback synthesis (see its
   inline comments); an `injectManifest` rewrite risked reintroducing exactly
   the "zero .html entries" bug that setup was built to avoid, for a payoff
   available more cheaply another way. Instead: `static/push-sw.js` (a plain,
   unbundled script SvelteKit copies verbatim to the build root) holds the
   `push`/`notificationclick` listeners, and `workboxOptions.importScripts:
   ['/push-sw.js']` in `pwa.config.mjs` has Workbox's generated `sw.js`
   `importScripts()` it in — same effective result, zero risk to the
   existing precaching behavior.
2. **`lib/pwa/push.ts`** — `isPushSupported()`,
   `requestPermissionAndSubscribe()` (Notification permission →
   `pushManager.subscribe()` using the server's VAPID public key → `POST
   /push/subscriptions`), `unsubscribe()`.
3. **Settings page** — "Deadline notifications" toggle, wired to
   `requestPermissionAndSubscribe`/`unsubscribe`.

## Native (Capacitor iOS/Android)

1. Add `@capacitor/local-notifications`.
2. **`lib/platform/deadline-notifications-native.ts`** — pure function
   computing "notifications that should be scheduled right now" from
   already-fetched lists/items (deadline set, unchecked, `list.useDeadline`,
   in the future), diffed against currently-scheduled IDs (stable hash of
   item id → int) to cancel/add only what changed. Re-run on: app resume,
   after item fetch/sync, after the notifications toggle turns on, after a
   list's `useDeadline` toggles.
3. Settings toggle requests `LocalNotifications.requestPermissions()`.

## Electron (apps/desktop)

1. **`main.cjs`** — tray icon + "Quit EveryList" menu item. When
   notifications are enabled, `window-all-closed` hides instead of quitting
   (closing the window minimizes to tray); disabled keeps the current
   quit-on-close behavior.
2. Reuses `deadline-notifications-native.ts`'s pure due-items computation,
   generalized, but fires via the renderer's `Notification` API directly on
   a `setInterval` (no viable Web Push path without external FCM wiring).
   `backgroundThrottling: false` on the window so the interval keeps ticking
   while hidden in the tray.

## Cross-cutting behavior

- Checked item, deleted item/list, or `useDeadline` toggled off → all three
  paths stop notifying (server query filters naturally; native/Electron
  reschedule drops it on next recompute).
- Edited deadline → server clears `deadline_notification_sends` for that
  item; native/Electron reschedule replaces the timer.

## Test strategy

- **API**: scheduler due-window unit tests (mirrors `backup_service.spec.ts`),
  subscribe/unsubscribe functional tests, send-dedup tests (mock
  `web-push`).
- **Web**: push module tests (mock `pushManager`/service worker), settings
  toggle tests, native due-items pure-function tests.
- **Desktop**: due-items computation reuse tests, tray/background-run
  behavior tests per existing `apps/desktop` vitest setup.

Full `pnpm check` (web+api+shared) and `apps/desktop`'s own `pnpm test`
before done.

## Out of scope (future)

Advance ("remind me N minutes before") reminders, per-subscription timezone
capture, true native push (APNs/FCM).
