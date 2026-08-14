# Phase 5 — Offline & PWA

## Context

Phases 0–4 of EveryList (see `foundational/PLAN.md`) are complete: auth, list/item/category/store/favorite CRUD, a themed app shell, and membership-based sharing with SSE real-time updates. Phase 5 (§4/§7/§9/§11/§14 of PLAN.md) is the **MVP-complete milestone**: the app currently has zero offline capability — no Dexie, no service worker, no manifest — and every mutation requires a live connection. This phase makes the app local-first: optimistic Dexie-backed writes, a durable sync queue with backoff, server-side `version`-based last-write-wins conflict resolution (PLAN.md §7), client-side auto-categorization so an offline-added item still gets a category guess without a round trip (PLAN.md §9), and full PWA installability with a Workbox service worker.

Scope decisions locked in with the user before this plan:
- **Conflicts resolve as silent merge + toast**, not a dedicated conflict-review screen — the server's copy wins, the client's differing fields are re-applied as a new edit, the user sees a toast. Matches PLAN.md §7's explicit rejection of CRDT-style complexity.
- **No new "recently deleted" recovery UI** for Category/FavoriteItem/Store/StoreCategoryOrder — the soft-delete columns added below exist purely so an offline delete-then-sync has a well-defined, conflict-safe outcome, not to add new recovery UX. Item/List recovery UI (from Phase 2) is untouched.
- **Per-resource `expectedVersion`, not a new batch sync endpoint** — every mutation already flows through `ListPolicy` → validate → mutate → `broadcastSync` on its own controller; a batch endpoint would either duplicate that six times or just loop and call the same logic anyway.

## 1. Database & backend versioning

**Migration** — add `version integer NOT NULL DEFAULT 1` to `lists`, `categories`, `items`, `favorite_items`, `stores`, `store_category_orders`. Add nullable `deleted_at` (soft-delete) to `categories`, `favorite_items`, `stores`, `store_category_orders` — currently only `List`/`Item` have it, and an offline delete-then-sync needs to resolve as a versioned update (row still exists, `deletedAt` set, `version` bumped), not a hard delete with no reconciliation target. `list_members`/`list_invites`/`users` are excluded — never mutated through the offline queue. Run `node ace migration:run` to regenerate `apps/api/database/schema.ts` (auto-generated, never hand-edited).

**Version bump semantics** — every mutating action in `items_controller.ts`, `categories_controller.ts`, `favorite_items_controller.ts`, `stores_controller.ts`, `lists_controller.ts`, and the store-category-order reorder action increments `version` by 1 immediately before `.save()`; creates start at `version: 1`. The four newly-soft-deletable entities' `destroy` actions switch from hard `.delete()` to soft-delete + version bump (mirroring `items_controller.ts`'s existing Item soft-delete pattern).

**Conflict contract** — `updateItemValidator`, `updateCategoryValidator`, `updateFavoriteItemValidator`, `updateStoreValidator`, `updateListValidator`, and the store-category reorder validator each gain an optional `expectedVersion: vine.number().optional()`.
- Omitted (every existing/online caller) → unchanged behavior, no check, version still bumps.
- Present → controller checks `row.version === expectedVersion`. Match → apply mutation, bump version, `broadcastSync`. Mismatch → **no mutation applied**, respond **409** with `{ data: <entity via its normal transformer>, conflict: true }`, no broadcast (nothing changed).

Bulk `POST /lists/:id/items/import` is unaffected — creates are never version-conflicted, each new row just starts at `version: 1`; its existing single-event-per-batch broadcast (`payload: { count }`) is unchanged.

**Broadcast/DTO plumbing**:
- `SyncBroadcastInput` (`apps/api/app/services/sync_broadcaster.ts`) gains `version?: number` (omitted only for `import`'s batched multi-row event, matching that call site's existing `entityId: list.id` placeholder-id precedent).
- `packages/shared/src/domain.ts`'s `SyncEventDto` gains `version: number | null`.
- `ListDto`/`CategoryDto`/`ItemDto`/`FavoriteItemDto`/`StoreDto` gain `version: number`; add `StoreCategoryOrderDto` if the reorder response doesn't already have a first-class DTO to hang `version` off of.
- Add `export interface ConflictResponse<T> { data: T; conflict: true }` to `domain.ts`.
- Rebuild `packages/shared` (`pnpm --filter @everylist/shared build`) — both apps consume committed `dist/`, not `src/`.

## 2. Shared package: auto-categorization move

Move `apps/api/app/services/auto_categorize_service.ts` (pure function, zero Adonis/Lucid dependency) verbatim to `packages/shared/src/auto-categorize.ts`, exported from `packages/shared/src/index.ts`. Delete the API-side original — no pass-through shim, per the project's no-speculative-abstraction rule. `items_controller.ts`'s `resolveCategoryId` helper switches its import from `#services/auto_categorize_service` to `@everylist/shared`. Move the existing keyword-matcher unit tests to `packages/shared`'s test directory. This is the whole point of the move: the Dexie-side optimistic item insert (§4) can guess a category with the same table the server uses, with no round trip.

## 3. Dexie schema (`apps/web/src/lib/offline/`)

**`db.ts`** — `EveryListDB extends Dexie`, constructed lazily/guarded on `typeof window` the same way `token.ts`/`selected-store.ts`/`realtime.ts` guard SSR (SvelteKit prerenders `/`, `/login`, `/signup`, where `indexedDB` doesn't exist). Tables: `lists` (pk `id`), `categories` (pk `id`, idx `listId`), `items` (pk `id`, idx `[listId+deletedAt]`, `categoryId`), `favoriteItems` (pk `id`, idx `listId`), `stores` (pk `id`), `storeCategoryOrders` (pk `[storeId+categoryId]`, idx `storeId`), `selectedStore` (pk `listId`, migrated local-only "currently shopping at" state — never touches the sync queue, per PLAN.md §7/§9), `syncQueue`. Cached-entity rows mirror their `*Dto` shape plus `_localId?: string` (present on offline-created rows before server ack) and `_dirty?: boolean` (true while a queued mutation on that row is unacked — suppresses stale realtime overwrites, §4).

**Local ID strategy** — client-generated **negative integer temp ids** for offline-created rows, swapped for the server's real id on ack. Every DTO's `id` is `number` throughout the codebase; a UUID would widen `id: number → number | string` everywhere, whereas a negative-int convention stays scoped entirely to the offline layer.

**`sync-queue.ts`**:
```ts
interface QueuedMutation {
  id?: number;
  entityType: 'list' | 'category' | 'item' | 'favorite_item' | 'store' | 'store_category_order';
  op: 'create' | 'update' | 'delete';
  targetId: number;
  expectedVersion: number | null; // null for create
  payload: Record<string, unknown>;
  status: 'pending' | 'sending' | 'conflict' | 'failed';
  attempts: number;
  createdAt: number;
  lastError?: string;
}
```

**`selected-store.ts` migration** — `apps/web/src/lib/api/selected-store.ts` moves from `localStorage` to the Dexie `selectedStore` table, keeping the same exported function names (`getSelectedStore`/`setSelectedStore`) but now **async**. Every call site (list-detail page's category-ordering logic, stores pages) updates from sync read to `await`.

## 4. Sync engine (`apps/web/src/lib/offline/sync-engine.ts`, `flush.ts`)

**Write path** — the existing mutation functions in `apps/web/src/lib/api/{items,categories,favorites,stores}.ts` are modified in place (not duplicated into a second API surface): write optimistically to the relevant Dexie table and return synchronously for immediate render (temp negative id for create, direct merge for update, `deletedAt` set for delete) → enqueue a `QueuedMutation` (`status: 'pending'`) → if `navigator.onLine`, immediately attempt to flush just that one mutation via the existing `apiFetch`; success dequeues and replaces the optimistic row with the server's authoritative response (id swap on create, version bump on update); network failure leaves it queued for the flush path. Offline: skip straight to queued.

**Flush path** (`flush.ts`, a lazy module-level singleton like `realtime.ts`) — `online` event drains `pending` rows oldest-first, sequentially per entity (preserves `expectedVersion` ordering; parallel flushing could let a later mutation race ahead and violate it). Network-error failures get exponential backoff (2s base, ~60s cap, jittered) up to a max-attempts cutoff, after which the row is marked `failed`. Background Sync API registration (`registration.sync.register(...)`) layers on as a progressive enhancement for browsers that support it (Chromium; not Safari/Firefox) — never the sole mechanism, since the `online` listener is the guaranteed path. New `SyncStatusBanner.svelte`, rendered once in the root layout, shows a pending/failed/conflict count with a manual "Retry now" button. A 409 during flush triggers conflict resolution instead of a plain retry.

**Conflict resolution (silent merge + toast)** — on 409: overwrite the local Dexie row with the server's returned copy, re-diff the client's original locally-queued change against the pre-conflict local copy, re-enqueue only the differing fields as a **new** mutation carrying the just-received `version` as the new `expectedVersion`. Surfaced only as a toast ("Some changes to 'Milk' were reconciled with a newer edit") — no per-field merge UI, matching the locked-in scope decision.

**Realtime interaction** — `realtime.ts`'s `subscribeToList` currently (Phase 4) just toasts and requires a manual full refetch. Phase 5 changes the list-detail handler: an incoming `SyncEventDto` for an entity with a `_dirty: true` local row (this client has an unacked queued mutation on it) is **suppressed** — the eventual flush response is authoritative, not a racing SSE push reflecting a stale mid-transit state. For entities without a pending local mutation, the event now drives a live optimistic Dexie merge (write if `incoming.version > local.version`, ignore if stale/out-of-order) instead of requiring a manual refresh — the actual offline/realtime integration payoff of this phase.

## 5. PWA / service worker

**`vite-plugin-pwa` in `generateSW` mode**, not `injectManifest` — this app's SW needs (precache app shell, stale-while-revalidate on `/api/v1/*` GETs, offline navigation fallback, one explicit precache entry for the lazy `@mdi/js` icon-picker chunk) are fully declarative via `globPatterns`/`runtimeCaching`/`navigateFallback`/`additionalManifestEntries` — no custom SW source file needed. Try `@vite-pwa/sveltekit` first; verify it plays correctly with `adapter-static`'s non-default `fallback: '200.html'` output before committing — fall back to plain `vite-plugin-pwa` configured against the built `build/` dir otherwise.

Manifest icons generated from `branding/icon.svg` into `apps/web/static/icons/` (192/512 + a safe-zone-padded maskable 512 variant) — check whether `branding/icon-{512,192,...}.png` already exist and can be resized/copied rather than regenerated from scratch.

**Install prompt** — new `apps/web/src/lib/pwa/install-prompt.ts` + `InstallPrompt.svelte`, capturing `beforeinstallprompt` (Chromium) into a store, shown as a dismissible row in Settings' "About" section (non-nagging, no unprompted modal, per PLAN.md §9). iOS Safari has no such event — show a static "Add to Home Screen" hint instead when on iOS Safari and not already standalone.

## 6. Testing

**Backend**: extend `apps/api/tests/functional/{items,categories,favorites,stores,lists}.spec.ts` with stale-`expectedVersion` (409 + server copy), matching-`expectedVersion` (success, version+1), and omitted-`expectedVersion` (unchanged) cases. Extend `apps/api/tests/unit/sync_broadcaster.spec.ts` to assert `version` on the broadcast payload. `.c8rc.json`'s 100% gate applies as-is.

**Frontend**: `offline/db.spec.ts` (node + new `fake-indexeddb` devDependency — table creation, SSR-guard); `sync-queue.spec.ts`; `sync-engine.spec.ts` (optimistic write, immediate-flush-when-online, queue-when-offline, 409-reconcile-and-requeue, backoff via fake timers); `flush.spec.ts` (online-listener trigger, mocked Background Sync registration); `SyncStatusBanner.svelte.spec.ts`, `InstallPrompt.svelte.spec.ts`; extended `lists/[id]/+page.svelte.spec.ts` for dirty-row suppression; migrated `selected-store.spec.ts`/`.svelte.spec.ts` for async signatures. Coverage stays at the existing 100%-across-four-metrics gate; the one expected new `/* v8 ignore */` is the iOS-Safari-UA-sniffing branch in `InstallPrompt.svelte` (genuinely unreachable from a Chromium test runner — documented as UA-unreachability, a different rationale than the existing `vi.mock`-corruption exceptions in `token.ts`/`selected-store.ts`/`realtime.ts`).

**Playwright E2E** — first real use of `apps/web/playwright.config.ts` (configured, zero matching spec files today). New `apps/web/e2e/offline-sync.e2e.ts`: sign up → create list → `page.context().setOffline(true)` → add items (assert optimistic render, banner shows pending count) → `setOffline(false)` → wait for queue drain → reload → confirm server-side persistence. Verify early whether the existing static-preview `webServer` config is sufficient or whether this test needs the `docker-compose.yml` dev stack (api+web) running instead, since it needs a real backend to sync against — this affects how CI's Playwright stage invokes it. Required merge gate, not folded into the 100% unit-coverage number, matching existing E2E policy.

## 7. Implementation order

1. Backend versioning (§1) — migrations, version bumps, `expectedVersion`/409 contract, broadcast/DTO plumbing, extended functional specs. Largest backend chunk; everything else depends on it.
2. Shared package (§2) — auto-categorize move, new DTO fields/`ConflictResponse<T>`, rebuild, update the one API import site.
3. Dexie schema + selected-store migration (§3) — independently mergeable; nothing writes through the sync queue yet.
4. Sync engine write + flush paths (§4) — the four API modules, `flush.ts`, `SyncStatusBanner.svelte`, realtime.ts dirty-row suppression. Largest frontend chunk.
5. PWA/SW/manifest/install prompt (§5) — deliberately last, independent of sync-engine correctness.
6. Testing sweep + E2E + status note update (§6) — close coverage gaps, write the offline Playwright scenario, manual end-to-end pass, update `foundational/PLAN.md`.

## Verification

- `pnpm --filter @everylist/api test` (c8-gated, must stay 100%) and `pnpm --filter @everylist/web test` (vitest coverage, must stay 100%) after each step above.
- `pnpm --filter @everylist/api typecheck` / `pnpm --filter @everylist/web typecheck` and lint clean.
- `pnpm --filter @everylist/web build` succeeds with the PWA plugin producing a service worker + manifest in the output.
- Manual pass: build+serve, DevTools → Application → Service Workers to confirm registration/precache, toggle Network → Offline, add/edit/delete items, toggle back online, confirm the sync queue drains and data matches the server.
- New `offline-sync.e2e.ts` Playwright spec passes locally.
- Update `foundational/PLAN.md`'s status line and append a Phase 5 completion note per this repo's existing convention (see the Phase 2/3/4 status notes at the bottom of the file).
