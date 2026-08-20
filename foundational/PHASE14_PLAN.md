# Phase 14 — Sync Status UI + Observability

## Goal

Replace the transient sync notification UI (floating banner + toasts) with:

1. A dedicated **Settings → Sync status** page listing queued items and *why* they haven't synced.
2. A small **cloud-disconnected icon** at the top of the app whenever the server is unreachable.
3. Server-side **version-conflict logging** so silent merges are auditable in `docker logs`.

## Background

Today's sync feedback is two floating elements:

- `SyncStatusBanner.svelte` (mounted in `+layout.svelte`): a bottom banner with a pending/failed
  count + "Retry now", polling `queueCounts()` every 3s, plus an auto-dismissing conflict toast.
- `SyncToast.svelte` (mounted in `lists/[id]/+page.svelte`): "This list was updated" (Refresh/
  Dismiss), triggered by realtime `subscribeToList` events and `onConflict`.

Neither is a real destination for understanding sync health, and conflicts are silently merged with
no record anywhere. The PWA already has a `NetworkFirst` runtime cache for `/api/v1/*` GETs with a
JSON-only `cacheWillUpdate` guard (`pwa.config.mjs`).

## Design decisions (locked)

- **Queued-items area**: dedicated `Settings → Sync status` page (`/settings/sync`), linked from
  Settings. (Matches PHASE13_PLAN.md §6's persistent-view design.)
- **Cloud icon**: global top-right overlay in the root layout, visible on all logged-in pages when
  the server is unreachable.
- **Unavailable detection**: real reachability — a dedicated `GET /api/v1/ping` probe plus flush
  network failures — not `navigator.onLine` alone.
- **Realtime updates**: silent auto-refresh (re-run `loadAll()`) on a non-dirty realtime event,
  replacing the "This list was updated" toast.
- **Ping semantics**: the probe is *available* only on **2xx AND `Content-Type: application/json`**.
  A proxy HTML placeholder/error page (SWAG returning HTML while the container is down/restarting)
  fails the content-type check. `fetch(..., { cache: 'no-store' })`, and `/api/v1/ping` is excluded
  from the service worker's runtime cache so no cached 200 can mask an outage. (304 is *not* a
  signal — the proxy returns 200 first; a stray non-2xx is treated as unavailable.)
- **Failed items**: surface `status === 'failed'` mutations with `attempts` + `lastError`.
- **Conflict observability**: log every 409 with expected-vs-actual version at `warn` level to
  stdout/container logs.

## Backend

### `GET /api/v1/ping` (new, no auth)

- `apps/api/start/routes.ts`: `router.get('ping', ({ response }) => response.ok({ pong: true }))`
  next to the `meta` route (~line 38). Inline handler (matches the SPA-fallback precedent; avoids
  touching the committed `#generated/controllers` registry for one trivial endpoint).
- `Content-Type: application/json` is already forced for `/api/*` by
  `force_json_response_middleware` + Adonis response negotiation.
- New `apps/api/tests/functional/ping.spec.ts` (mirrors `meta.spec.ts`): 200, `{ pong: true }`,
  `Content-Type` includes `application/json`, no auth required.

### Version-conflict logging

- `apps/api/app/services/version_conflict.ts`: add
  `reportVersionConflict(ctx, { entity, id, expectedVersion, actualVersion })` →
  `ctx.logger.warn(...)` with entity type, row id, expected vs actual version, `ctx.auth.user?.id`,
  and request method/URL.
- Wire it into each 409 branch across `items/lists/categories/folders/stores/favorite_items`
  controllers (~10 `if (hasVersionConflict(...))` sites) immediately before the 409 return.
- Output already lands on stdout (container logs): `config/logger.ts` →
  `transports.file({ destination: 1 })`.
- Level: `warn` (expected-but-notable), gated by `LOG_LEVEL`.
- New tests: assert the warn is emitted on a 409 with the version delta (API c8 100% gate).

## Shared

- `packages/shared/src/ping.ts` (or extend `meta.ts`): `PingResponse { pong: true }`, exported from
  `index.ts`.

## Frontend — offline layer

### `apps/web/src/lib/api/ping.ts` (new)

- `fetchPing(): Promise<boolean>` — `fetch('/api/v1/ping', { cache: 'no-store' })`; returns `false`
  on network throw, non-2xx, or `!contentType.includes('application/json')`; `true` only on
  2xx + JSON.

### `apps/web/src/lib/offline/connectivity.svelte.ts` (new)

Runes singleton (pattern: `picker-coordinator.svelte.ts`):

- `serverUnavailable = $state(false)`, `lastSuccessfulSyncAt = $state<number | null>(null)`.
- `startConnectivityMonitor()`:
  - `offline` event → `serverUnavailable = true`; `online` → immediate `fetchPing()`.
  - Periodic `fetchPing()` (~30s), only when `navigator.onLine !== false`.
  - Subscribes to `onFlushOutcome` (below): network-error drain → unavailable; successful drain →
    available + `lastSuccessfulSyncAt`.
- `pingNow()` + `resetConnectivityForTesting()`.

### `apps/web/src/lib/offline/flush.ts`

- Add `onFlushOutcome(listener)` (`Set`-listener shape like `onConflict`); emit `{ ok: false }` on
  the network-error abort, `{ ok: true }` + `lastSuccessfulFlushAt` when a drain leaves zero pending.
- On the network-error stall, record `lastError` on the stalling mutation (status stays `pending`)
  so the sync page shows "Network error — retrying" instead of a silent queue.

### `apps/web/src/lib/offline/sync-queue.ts`

- Add `failedMutations()` (symmetric to `pendingMutations()`) for the sync page. Keep `queueCounts()`.
  (The `conflict` status is currently dead — conflicts are reconciled and dequeued, so it is not
  surfaced in the UI.)

## Frontend — UI

### Remove

- Delete `SyncStatusBanner.svelte` + spec, `SyncToast.svelte` + spec.
- `+layout.svelte`: drop `SyncStatusBanner`; add `startConnectivityMonitor()` and render the icon.

### `apps/web/src/lib/components/SyncStatusIcon.svelte` (new)

- Fixed top-right (`top-3 right-3`, `z-30`, safe-area padding), rendered only when logged in and
  `serverUnavailable`. MDI `cloudOffOutline`, `aria-label="Server unavailable — tap for sync
  status"`; tap → `/settings/sync`. Visual pass for overlap with `PageHeader` actions (fallback:
  top-center / subtle badge).

### `apps/web/src/routes/settings/sync/+page.svelte` (new, + `+page.ts` `prerender=false; ssr=false`)

- Header (back to `/settings`); sections: connection status, last successful sync, pending/failed
  counts, per-item list (entity + op + description, `attempts`, `lastError`, status), and a "Retry
  now" button calling `flushQueue()`.

### `apps/web/src/routes/settings/+page.svelte`

- Add a "Sync status" row/section → `/settings/sync`, with a pending-count or "Server unavailable"
  hint.

### `apps/web/src/routes/lists/[id]/+page.svelte`

- Remove `SyncToast` / `syncToastVisible` / `refreshFromSync`; realtime handler (keeping
  `isRowDirty` suppression) and `onConflict` handler call `void loadAll()` instead of toasting.

## PWA

- `apps/web/pwa.config.mjs`: update the `/api/v1/` `urlPattern` to skip `/api/v1/ping`
  (`... && url.pathname !== '/api/v1/ping' && request.method === 'GET'`). In `generateSW` mode
  there is no custom SW source, so an unmatched request is forwarded straight to the network by the
  generated handler — the declarative equivalent of an imperative skip-cache `fetch` handler.

## Files to add/change

- **Add**: `packages/shared/src/ping.ts`; `apps/api/tests/functional/ping.spec.ts`;
  `apps/web/src/lib/api/ping.ts` (+ spec); `apps/web/src/lib/offline/connectivity.svelte.ts`
  (+ spec); `apps/web/src/lib/components/SyncStatusIcon.svelte` (+ spec);
  `apps/web/src/routes/settings/sync/+page.svelte` + `+page.ts` (+ spec).
- **Change**: `apps/api/start/routes.ts`; `apps/api/app/services/version_conflict.ts`;
  `apps/api/app/controllers/{items,lists,categories,folders,stores,favorite_items}_controller.ts`;
  `apps/web/src/lib/offline/{flush,sync-queue}.ts` (+ specs);
  `apps/web/src/routes/+layout.svelte`; `apps/web/src/routes/settings/+page.svelte` (+ spec);
  `apps/web/src/routes/lists/[id]/+page.svelte` (+ spec); `apps/web/pwa.config.mjs`.
- **Delete**: `apps/web/src/lib/components/SyncStatusBanner.svelte` + spec;
  `apps/web/src/lib/components/SyncToast.svelte` + spec.

## Tests

- New: `ping.ts` spec, `connectivity.svelte.spec.ts`, `SyncStatusIcon.svelte.spec.ts`,
  `settings/sync/page.svelte.spec.ts`, API `ping.spec.ts`, conflict-logging coverage.
- Update: `lists/[id]/page.svelte.spec.ts` (rewrite 4 sync-toast tests ~1500-1577 → silent
  `loadAll()` refresh, no toast); `settings/page.svelte.spec.ts` (new row);
  `flush.spec.ts` / `flush-loop*.spec.ts` (outcome events + network-error `lastError`);
  `sync-queue.spec.ts` (`failedMutations()`); `e2e/offline-sync.e2e.ts` (cloud icon appears while
  offline, disappears after reconnect; verify `/settings/sync` empty).

## Verification

- `pnpm check` clean (build shared, lint + typecheck all workspaces, coverage-gated test suites,
  web E2E).
- Manual: go offline → cloud icon appears; add item → item listed under Settings → Sync status with
  a description; reconnect → icon clears, queue drains; point at an unreachable host → icon + "server
  unavailable" + `docker logs` shows 409/`reportVersionConflict` records with version deltas.

## Risks / notes

- 100% coverage gate on both workspaces — every new branch needs coverage (`/* v8 ignore */` only
  for the established `vi.mock`-attribution artifacts). `+layout.svelte` is already coverage-excluded.
- `offline` event + `navigator.onLine === false` stay authoritative for the offline case; the ping +
  content-type check covers "browser online, container down".
- No SQL migration or schema change; Dexie `lastError` is already a non-indexed field.
