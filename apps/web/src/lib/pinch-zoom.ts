/** Guards every browser API access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser, like $lib/theme.ts and
 * $lib/orientation.ts. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function preventDefault(event: Event): void {
	event.preventDefault();
}

/** Blocks pinch-to-zoom on iOS Safari.
 *
 * Android Chrome already blocks this via the per-element `touch-action`
 * styling on scrollable/interactive rows (see
 * routes/lists/[id]/+page.svelte) — Blink derives the page's pinch-zoom
 * behavior natively from the `touch-action` of whatever's under each touch
 * point, entirely on the compositor thread. WebKit doesn't: iOS Safari's
 * viewport pinch-zoom is a separate native gesture that `touch-action`
 * never reaches, standalone PWA or not, so it needs its own handling —
 * https://developer.apple.com/documentation/webkitjs/gestureevent.
 * `gesturestart` is WebKit-only and never fires on Chrome/Android, which is
 * exactly why it's used here instead of a generic multi-touch `touchmove`
 * listener: a `touchmove` listener would apply to every engine, including
 * Blink, and registering a non-passive one hands Blink's own native
 * touch-action-driven pinch-zoom arbitration over to the main thread —
 * regressing the Android behavior this is not meant to touch. */
export function disablePinchZoom(): void {
	if (!hasWindow()) return;

	window.addEventListener('gesturestart', preventDefault);
}
