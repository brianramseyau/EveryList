/** Generalized "undo my last change" trigger registry (PLAN_21_PHASE_SHAKE_TO_UNDO.md) — grew out
 * of PLAN_20_PHASE_UNDO_DELETE_TOAST.md's item-delete-only undo toast, pulled out of
 * `routes/lists/[id]/+page.svelte` so any mutation site (not just delete) can register one, and so
 * the shake-to-undo gesture — which has no idea what page produced the last change, and lives at
 * the root layout, outside any page's own component tree — has something to trigger.
 *
 * Deliberately plain, non-reactive state (not a `.svelte.ts` module with `$state`): the actual
 * undo *toast* is rendered by whichever page registered the action, using its own page-local
 * `$state` (see `routes/lists/[id]/+page.svelte`) — a shared reactive value read directly by many
 * independently mounted/unmounted page instances across a test run turned out to break Svelte's
 * cross-component reactivity tracking. This module only needs to remember *what to run*; the
 * registering page's own callback is responsible for clearing its own toast state when the action
 * actually fires, whether that's from the toast's own button or a shake somewhere else in the app.
 */

let pending: (() => Promise<void>) | null = null;

export function registerUndo(action: () => Promise<void>): void {
	pending = action;
}

/** The toast's own dismiss-on-timeout path, and a page's `onDestroy` — leaving the page a pending
 * undo was registered on forfeits the undo window, so a shake on some other page later can't reach
 * back into a component that no longer exists. */
export function clearUndo(): void {
	pending = null;
}

/** Fires whichever undo is currently pending — the toast's own Undo button, and the shake
 * gesture's handler, both call this. No-ops if nothing is pending (e.g. a shake with no recent
 * change to revert, or the registering page was already left). */
export async function runUndo(): Promise<void> {
	const action = pending;
	pending = null;
	if (action) await action();
}

/** Test-only: this module's state is a singleton that would otherwise persist across every `it()`
 * sharing a test file (mirrors `$lib/offline/self-mutations.ts`'s `resetSelfMutationsForTesting`). */
export function resetUndoForTesting(): void {
	pending = null;
}
