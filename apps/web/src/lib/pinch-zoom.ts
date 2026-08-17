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
 * Android Chrome already blocks this via the app-wide `touch-action: pan-x
 * pan-y` baseline in routes/layout.css (refined per-element where a tighter
 * value like `manipulation` is wanted — see routes/lists/[id]/+page.svelte)
 * — Blink derives the page's pinch-zoom behavior natively from the
 * `touch-action` of whatever's under each touch point, entirely on the
 * compositor thread. WebKit doesn't: iOS Safari's viewport pinch-zoom is a
 * separate native gesture that `touch-action` never reaches, standalone PWA
 * or not, so it needs its own handling —
 * https://developer.apple.com/documentation/webkitjs/gestureevent.
 * `gesturestart`/`gesturechange` are WebKit-only and never fire on
 * Chrome/Android, which is exactly why they're used here instead of a
 * generic multi-touch `touchmove` listener: a `touchmove` listener would
 * apply to every engine, including Blink, and registering a non-passive one
 * hands Blink's own native touch-action-driven pinch-zoom arbitration over
 * to the main thread — regressing the Android behavior this is not meant to
 * touch.
 *
 * Both `gesturestart` and `gesturechange` are cancelled, not just
 * `gesturestart`: WebKit can keep delivering incremental `gesturechange`
 * scaling for a gesture that begins over a composited sticky/fixed layer
 * (e.g. the list page's sticky headings) even once the initiating
 * `gesturestart` was cancelled, so both need `preventDefault()` for the
 * block to hold everywhere, not just on elements in normal document flow. */
export function disablePinchZoom(): void {
	if (!hasWindow()) return;

	window.addEventListener('gesturestart', preventDefault);
	window.addEventListener('gesturechange', preventDefault);
}
