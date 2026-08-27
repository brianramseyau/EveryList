# Phase 18 — Android home-screen widget (Google Tasks-style)

## Context

EveryList already ships a native Android app (`apps/android`, a Capacitor wrapper around the
SvelteKit PWA — see PHASE13_PLAN.md). This phase adds a native home-screen widget whose UI and
interactions mirror Google Tasks, per the user's request:

- **Top-left:** small list selector (the dropdown that switches which list the widget shows).
- **Top-right:** a `+` icon for quick-adding items.
- **Tap an item row** to open/edit it.
- **Tap the row's checkbox** to complete it.
- A **show/hide-completed** toggle, plus the usual "show completed items" nuances.

(The original request said the selector was top-right; that was a typo — Google Tasks puts the
list selector top-left and the add button top-right, which is what we build.)

### The one architectural fact that shapes everything

The app's offline cache is **IndexedDB/Dexie inside the WebView** (`apps/web/src/lib/offline/db.ts`).
A native `AppWidgetProvider` runs in the *launcher* process and **cannot read** the WebView's
IndexedDB. So the widget is inherently **network-backed** against the user's self-hosted API. We
do not try to bridge the WebView's IndexedDB into native storage in this phase.

Decisions locked in with the user before implementation:

- **Native widget** (a real `AppWidgetProvider` in `apps/android`), not a PWA/web feature — this is
  the only place a true home-screen widget can live.
- **Credentials via an in-app auto-minted PAT.** The app's existing Personal Access Token
  machinery (Settings → Access Tokens, PHASE16_PLAN.md Stage 0) is the perfect primitive: a
  long-lived, per-list-scoped bearer token (`list:<id>:editor`). A new in-app flow mints a PAT
  named "Home-screen widget" and hands it to the widget over an in-app Capacitor plugin method
  (`EveryListWidget.configure`), which writes it to the widget's private SharedPreferences and
  opens the config screen. The user picks lists in-app; the widget configures itself. No typing
  tokens/URLs by hand. (The first draft carried the token in an `everylist://widget-config` deep
  link; that was dropped during review because Android can surface intent data URIs in
  `dumpsys`/logcat — the token now lives only in private storage and never in a loggable URI.)
- **Full Google-Tasks-style scope** for v1 (list selector, quick-add, tap-to-edit, checkbox
  complete, show/hide completed).
- **Offline = show last-fetched snapshot + an error note.** The widget persists its most recent
  successful fetch to `SharedPreferences` and renders that (with a "can't reach server" indicator)
  when a refresh fails. This is the closest a native widget can get to the app's offline-first
  ethos without mirroring data into native storage.
- **Quick-add deep-links into the app** for v1 rather than an inline widget dialog — reuses the
  app's existing add flow, autocomplete, and auto-categorization.

### No backend changes

`GET /lists`, `GET /lists/:id/items` (filtering `deletedAt`), `POST /lists/:id/items`, and
`PATCH /lists/:id/items/:itemId` (accepts `checked`) already exist, and PAT scoping
(`ListPolicy`) already authorizes them for `list:<id>:editor`. The widget authenticates with
`Authorization: Bearer <elt_...>` exactly like the Home Assistant integration does. The only shared
addition is a DTO describing the app→widget handoff payload.

## Shared — `packages/shared`

- **`src/domain.ts`**: add `WidgetConfigDto { token: string, listIds: number[], serverUrl: string }`
  — the app→native-widget handoff payload passed to the `EveryListWidget.configure` plugin method.
  Export from `index.ts`.

(No API migration, model, controller, or route changes — the PAT endpoints already exist.)

## Web — `apps/web` (deep links + mint/handoff + Settings entry)

1. **Deep-link support** (`@capacitor/app` is already a dependency) — for app navigation only,
   never for credentials:
   - Add a custom-scheme intent-filter (`everylist://`) to `apps/android/.../AndroidManifest.xml`
     (Capacitor's standard deep-link setup).
   - In `apps/web/src/routes/+layout.svelte`, alongside the existing startup logic, add an
     `appUrlOpen` listener (gated on `Capacitor.isNativePlatform()` so the PWA/Docker build is
     unaffected) that routes:
     - `everylist://lists/<id>/items/<itemId>` → `goto` the item editor page.
     - `everylist://lists/<id>` → `goto` the list page (the widget `+` button's target).
     - `everylist://settings/widget` → `goto` the widget config page (the widget's "set up" state).
2. **`apps/web/src/lib/widget.ts`** — `configureWidget(listIds)`:
   - `createToken('Home-screen widget', listIds, 'editor')` (reuse `lib/api/tokens.ts`).
   - Hand the `WidgetConfigDto` (`token`, `listIds`, `getServerUrl()`) to the native
     `EveryListWidget.configure` plugin method via `Capacitor.registerPlugin('EveryListWidget')`.
     No token touches a URL. No-op / guarded when not native.
3. **Settings entry** (`apps/web/src/routes/settings/+page.svelte`): add a "Home-screen widget" row
   under the Integrations section (styled like the Access Tokens row), linking to a new page.
4. **New route** `apps/web/src/routes/settings/widget/+page.svelte` (`+page.ts` with
   `prerender = false; ssr = false`, same as `/settings/tokens`):
   - Lets the user pick one or more owned lists (reuse the tokens page's owned-lists multi-select
     pattern) and tap "Create widget".
   - Calls `configureWidget(...)`; the native shell takes it from there.

## Native — `apps/android` (the widget itself)

New Java sources under `apps/android/app/src/main/java/au/brianramsey/everylist/`:

1. **`EveryListWidget.java`** — `AppWidgetProvider`:
   - `onUpdate` renders the widget from the configured list's data.
   - Refresh sources: Android's `updatePeriodMillis` (floored at ~30 min) **plus** a manual refresh
     button in the widget header.
   - Renders from the `SharedPreferences` snapshot when the network refresh fails (offline path).
2. **`EveryListWidgetPlugin.java`** — the Capacitor plugin backing the handoff: `configure`
   receives the `WidgetConfigDto`, writes the credentials into the global `SharedPreferences`
   (never into a URI), and starts `WidgetConfigActivity`. Registered in `MainActivity` via
   `registerPlugin(EveryListWidgetPlugin.class)`.
3. **`WidgetConfigActivity.java`** — the config screen (`android:configure` on the provider info):
   - Reads the already-provisioned credentials from `SharedPreferences` (written by the plugin).
   - Lets the user choose which granted list to display and the show/hide-completed default.
   - Persists selected list + show/hide to per-widget `SharedPreferences`.
4. **`WidgetApiClient.java`** — plain HTTP calls against `${serverUrl}` with
   `Authorization: Bearer <token>`:
   - `GET /api/v1/lists` (selector), `GET /api/v1/lists/<id>/items` (rows), `PATCH
     /api/v1/lists/<id>/items/<itemId>` (check/uncheck). Never runs on the main thread.
5. **`WidgetUpdateService.java`** — a `Service` target for the widget's pending intents, so
   checkbox taps and refresh happen off the main thread.
6. **Layouts** (`res/layout/widget_everylist.xml`):
   - Header row: **list selector (top-left)**, **`+` (top-right)**, show/hide-completed toggle, and
     a manual refresh button.
   - A scrollable item list (ListView/StackView) with per-row checkbox + tap-to-open.
7. **`res/xml/everylist_widget_info.xml`** — `AppWidgetProviderInfo` (`minWidth/minHeight`, preview
   image, config activity).
8. **Taps:**
   - **Checkbox** → `RemoteViews.setPendingIntentTemplate` with a fill-in Intent carrying the item
     id; the service calls `PATCH /items/:id { checked }` and refreshes.
   - **Item row** → deep link `everylist://lists/<id>/items/<itemId>` → opens the app's item editor.
   - **`+`** → deep link into the app's add flow for the selected list.
   - **List selector** → opens `WidgetConfigActivity` (or a lightweight picker).
9. **Manifest:** register the provider (`<receiver android:name=".EveryListWidget">` +
   `APPWIDGET_UPDATE` intent-filter + metadata), the config activity (`APPWIDGET_CONFIGURE`), and
   the `everylist://lists` custom-scheme deep-link filter on `MainActivity` (app navigation only —
   credentials never travel in a URL).

## Docs

- This plan.
- Update `README.md` and `foundational/PLAN.md` to mention the Android home-screen widget.
- Add an `AGENTS.md` note only if warranted (e.g. the deep-link wiring or a build gotcha).

## Testing

- **api**: unchanged (PAT tests already cover the mint endpoint) — confirm `pnpm check` clean.
- **web** (Vitest, 100% gate): `widget.ts` (mint + plugin handoff, native-only guards) and the
  `+layout.svelte` deep-link routing branches.
- **android** (JUnit under `apps/android/app/src/test/java/...`): `WidgetApiClient` URL/parsing/
  error handling; `WidgetJson` parsing/filtering/snapshot round-trip.
- **CI**: `native-build.yml` already runs `assembleDebug`; optionally run `./gradlew test`.

## Implementation order

1. Write this plan (done).
2. **Part 1** — shared `WidgetConfigDto`.
3. **Part 2** — web `widget.ts` (mint + plugin handoff) + Settings entry + widget config page.
4. **Part 3** — native Android widget.
5. **Part 4** — tests + docs + `pnpm check` + build verification.
