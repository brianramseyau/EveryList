# Phase 21 — Shake to undo

## Context

EveryList's Android and iOS apps are **not separate native codebases** — both are thin Capacitor
shells (`apps/ios`, `apps/android`) wrapping the exact same SvelteKit build as the PWA
(`apps/web`). So "add shake-to-undo to Android and iOS" means adding it once, in shared
`apps/web/src` code, with a Capacitor-plugin branch for native behavior and a browser-API
fallback for the PWA — the same pattern the codebase already uses for orientation lock
(`apps/web/src/lib/orientation.ts`).

Undo currently exists for one thing: deleting a list item (PLAN_20_PHASE_UNDO_DELETE_TOAST.md —
`apps/web/src/lib/components/UndoToast.svelte` + local `pendingUndo` state in
`apps/web/src/routes/lists/[id]/+page.svelte`). There is no general "last action" concept — undo
is single-purpose, single-slot, and scoped to one page. This phase generalizes that just enough to
cover the everyday "oops" actions (delete, check/uncheck, add), makes it available app-wide, and
lets a phone-shake trigger whatever undo is currently active — mirroring what tapping the toast's
"Undo" button already does. Building a fully general, unbounded undo history for every mutation
type (reorders, multi-field edits, moves) is out of scope: it would require snapshotting "before"
state everywhere mutations happen and isn't what "shake to undo my last change" implies — users
mean the thing they *just* did, within the same few-second window the undo toast already
represents.

Shake detection is wanted on native Android/iOS **and** the installed PWA, not native-only — but
each surface gets its own independent on/off state via the same Settings toggle (`localStorage` is
per browser/installation), since a phone running the PWA is more prone to accidental shakes while
just being held than the natively-launched app.

## Approach

### 1. Generalize the undo slot out of the list page

New module `apps/web/src/lib/undo.svelte.ts`, replacing the local `pendingUndo` state in
`apps/web/src/routes/lists/[id]/+page.svelte` (lines ~536-550):

```ts
interface PendingUndo {
	message: string;
	undo: () => Promise<void>;
}
let pending = $state<PendingUndo | null>(null);

export function undoState() {
	return pending;
}
export function registerUndo(message: string, undo: () => Promise<void>) {
	pending = { message, undo };
}
export function clearUndo() {
	pending = null;
}
export async function runUndo() {
	const action = pending;
	pending = null;
	if (action) await action.undo();
}
```

Single-slot by design (matches today's behavior): registering a new undo replaces whatever was
pending, same as today's `pendingUndo = item`.

### 2. Move `<UndoToast>` to the root layout

`apps/web/src/routes/+layout.svelte` renders one `<UndoToast>` bound to `undoState()`, `onAction`
→ `runUndo()`, `onDismiss` → `clearUndo()`. This makes the undo affordance (tap or shake)
available from any route, not just the list detail page. Remove the local
`pendingUndo`/`UndoToast` block from `apps/web/src/routes/lists/[id]/+page.svelte` and replace
`removeItemWithUndo` with a call to
`registerUndo('Item deleted', () => undoDeleteItem(listId, item.id))`.

### 3. Extend coverage to check/uncheck and add-item

Using the same `registerUndo` call, wire in:

- **Check/uncheck** (`updateItem(listId, id, { checked })`): register an undo that calls
  `updateItem` again with the previous `checked` value.
- **Add item** (`createItem`): register an undo that calls `deleteItem` on the just-created item's
  id.

Reuses existing `apps/web/src/lib/api/items.ts` functions (`updateItem`, `createItem`,
`deleteItem`, `undoDeleteItem`) — no changes needed there. Reorders and multi-field edits stay out
of scope per above.

### 4. Shake detection module

New `apps/web/src/lib/shake.ts`, following `orientation.ts`'s native/web branching:

- **Native (Capacitor, both Android and iOS)**: use `@capacitor/motion` (official plugin, add to
  `apps/web/package.json`) — `Motion.addListener('accel', ...)`. The plugin gives raw accelerometer
  readings, not a shake event, so implement magnitude-over-threshold-with-debounce detection:
  compute `sqrt(x²+y²+z²)`, subtract gravity baseline, fire once per shake with a cooldown (e.g.
  1s) so a single shake doesn't fire repeatedly. This threshold/debounce logic should be a small
  pure function so it's unit-testable without real sensor input.
- **Web/PWA fallback**: browser `devicemotion` event, same magnitude logic. iOS Safari requires
  `DeviceMotionEvent.requestPermission()` behind a user gesture (button tap) before it will fire —
  Android needs no such prompt. This mirrors the PWA-vs-native asymmetry already documented for
  orientation lock in `AGENTS.md`.
- Exported API mirrors `orientation.ts`'s shape: `canUseShakeDetection()`,
  `requestShakePermission()` (only meaningful on iOS web), `startShakeListening(onShake)`,
  `stopShakeListening()`.

On shake: check `undoState()` — if a pending undo exists, call `runUndo()`; if not, no-op (no
spurious toast).

### 5. Settings toggle

Add a "Shake to undo" preference to `apps/web/src/routes/settings/+page.svelte`, following the
orientation preference's exact pattern: `localStorage` key (e.g. `everylist:shakeToUndo`),
default **on**, a toggle control, and — for the iOS-web case — a permission-request affordance
with an explanatory note if permission is denied/unsupported (mirrors `orientationFeedback`).

This single toggle is what lets PWA users turn the feature off independently of the native app —
`localStorage` is per browser/installation, so a phone running EveryList as an installed PWA gets
its own on/off state distinct from the native app on the same device.

Call `initShake()` from `apps/web/src/routes/+layout.svelte`'s `onMount`, alongside
`initTheme()`/`initAccent()`/`initOrientation()` (lines ~47-49), and tear down the listener on
`onDestroy`.

### 6. iOS native project change

`@capacitor/motion` requires `NSMotionUsageDescription` in `apps/ios/App/App/Info.plist` (a
one-line addition) — without it, iOS kills the app when motion access is requested. No Android
manifest change needed (accelerometer access needs no runtime permission).

## Files touched

- `apps/web/src/lib/undo.svelte.ts` — new, generalized undo slot
- `apps/web/src/lib/shake.ts` — new, shake detection (native + web branches)
- `apps/web/src/lib/components/UndoToast.svelte` — unchanged (already generic)
- `apps/web/src/routes/+layout.svelte` — render `<UndoToast>`, call `initShake()`
- `apps/web/src/routes/lists/[id]/+page.svelte` — replace local `pendingUndo` with `registerUndo`,
  add check/uncheck and add-item undo registration
- `apps/web/src/routes/settings/+page.svelte` — add "Shake to undo" toggle
- `apps/web/package.json` — add `@capacitor/motion`
- `apps/ios/App/App/Info.plist` — add `NSMotionUsageDescription`

## Verification

- Unit tests for the shake magnitude/debounce pure function (`shake.spec.ts`) — deterministic, no
  real sensor needed.
- Unit tests for `undo.svelte.ts` (register/run/clear/replace semantics).
- Manual, on a running build (reproduce live rather than reading code for behavior changes):
  - **Android**: run in an emulator using the Extended Controls → Virtual Sensors panel to inject
    accelerometer motion, or shake a physical device via `npx cap run android`.
  - **iOS**: use the Simulator's Hardware → Shake Gesture menu, or shake a physical device via
    `npx cap run ios`.
  - Confirm: shaking within a few seconds of a delete/check/add reverts it and dismisses the
    toast; shaking with no pending undo does nothing; toggling the Settings switch off stops
    shakes from doing anything; on iOS Safari (PWA, not installed app) the permission prompt
    appears once and is respected thereafter; the PWA and native app toggle states are independent
    on the same device.
