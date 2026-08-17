/** Guards every browser API access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser, like $lib/theme.ts and
 * $lib/orientation.ts. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function preventDefault(event: Event): void {
	event.preventDefault();
}

/** Blocks pinch-to-zoom app-wide.
 *
 * Android Chrome already treats this as covered by the per-element
 * `touch-action` styling on scrollable/interactive rows (see
 * routes/lists/[id]/+page.svelte) — Blink derives the page's pinch-zoom
 * behavior from the `touch-action` of whatever's under each touch point.
 * WebKit doesn't: iOS Safari's viewport pinch-zoom is a separate native
 * gesture that `touch-action` never reaches, standalone PWA or not, so it
 * needs its own handling —
 * https://developer.apple.com/documentation/webkitjs/gestureevent.
 * `gesturestart` is WebKit-only (fired for the two-finger pinch itself);
 * the multi-touch `touchmove` listener is the fallback for engines that
 * don't fire `gesturestart` at all, so between the two every engine is
 * covered without needing to branch on platform. */
export function disablePinchZoom(): void {
	if (!hasWindow()) return;

	window.addEventListener('gesturestart', preventDefault);

	window.addEventListener(
		'touchmove',
		(event) => {
			if (event.touches.length > 1) event.preventDefault();
		},
		{ passive: false }
	);
}
