// Lets a click handler declare navigation intent that `+layout.svelte`'s
// `onNavigate` view-transition hook can't otherwise infer. `onNavigate` only
// sees a real 'back' direction for actual browser back/forward (popstate)
// navigations — a same-origin `<a href>` click (e.g. PageHeader's back
// arrow) always looks like a forward navigation to it, even though it's
// visiting a "previous" screen. Call `markBackNavigation()` in that link's
// `onclick` (fires synchronously before SvelteKit's router processes the
// click) so the hook can read the intent back out.
let pendingDirection: 'back' | null = null;
let pendingSkip = false;

export function markBackNavigation(): void {
	pendingDirection = 'back';
}

/** BottomNav's section-switch links opt out of the transition entirely
 * (PLAN_09_PHASE_REFINEMENTS.md #11 follow-up) — it's reserved for moving between screens
 * within a section, not for jumping to a different bottom-nav tab. */
export function markSkipTransition(): void {
	pendingSkip = true;
}

export function consumeNavDirection(isPopstateBack: boolean): 'back' | 'forward' {
	const direction = isPopstateBack || pendingDirection === 'back' ? 'back' : 'forward';
	pendingDirection = null;
	return direction;
}

export function consumeSkipTransition(): boolean {
	const skip = pendingSkip;
	pendingSkip = false;
	return skip;
}

// A screen reached by clicking into it from the list-detail page (item edit,
// list settings) can return to that exact list with a real `history.back()`
// instead of pushing a fresh navigation to it — SvelteKit only restores a
// page's prior scroll position for a genuine back/forward (popstate)
// traversal, and a real back also collapses the stale intermediate entry
// instead of leaving it for the *next* back press to land on. Call
// `markListOrigin()` in the entry link's `onclick` (same timing as
// `markBackNavigation`, above) and `consumeListOrigin()` once when the
// destination screen mounts. Left unset — so `consumeListOrigin()` reports
// false — for any other way of reaching that screen, e.g. the native app's
// `everylist://lists/<id>/items/<itemId>` widget deep link
// (+layout.svelte's `appUrlOpen` handler), which has no list entry in this
// tab's history to go back to.
let pendingListOrigin = false;

export function markListOrigin(): void {
	pendingListOrigin = true;
}

export function consumeListOrigin(): boolean {
	const origin = pendingListOrigin;
	pendingListOrigin = false;
	return origin;
}

// A real `history.back()` (see above) only gets `markListOrigin`'s screen
// back to the *URL* it left from — SvelteKit's own scroll restoration still
// loses the race against this app's client-only data load: the list page
// starts every fresh mount (a back navigation included — the component was
// fully torn down when it navigated away, same as a forward one) with
// `loading` true and `items` empty, so the "Loading…" placeholder is all
// there is to scroll when the browser applies the remembered scrollY —
// clamped near the top of that near-empty page, with nothing to redo it
// once the real content streams back in a moment later. Remembering the
// scroll position ourselves and reapplying it once the list has actually
// reloaded (list-detail's own onMount, after `loadAll()` resolves) works
// around that gap. Keyed by listId so a move-to-a-different-list (or any
// other stale, never-consumed entry) can't get replayed onto the wrong
// list — `consumeListScroll` returns null for a mismatched id instead.
let pendingListScroll: { listId: number; scrollY: number } | null = null;

export function rememberListScroll(listId: number, scrollY: number): void {
	pendingListScroll = { listId, scrollY };
}

export function consumeListScroll(listId: number): number | null {
	const remembered = pendingListScroll;
	pendingListScroll = null;
	return remembered && remembered.listId === listId ? remembered.scrollY : null;
}
