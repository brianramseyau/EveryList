/* v8 ignore start */ // Imports: other specs' `vi.mock('@capacitor/...')` corrupts their V8
// function attribution once merged into the full suite — the same coverage-collection
// artifact documented on `lib/api/items.ts`; pull-to-refresh.spec.ts alone reports these covered.
import { Capacitor } from '@capacitor/core';
/* v8 ignore stop */

/** Android-only: the native `PullToRefreshControl` Capacitor plugin (MainActivity.java's
 *  `RefreshGestureAwareLayout`). A plain downward drag on the swipe-to-dismiss undo toast
 *  (UndoToast.svelte) is indistinguishable, at the native touch-dispatch level, from a genuine
 *  pull-to-refresh — both are a vertical drag starting while the page is scrolled to the top,
 *  which is exactly the condition SwipeRefreshLayout watches for. Unlike the reorder-drag and
 *  swipe-reveal gestures RefreshGestureAwareLayout already disambiguates by hold-time/direction,
 *  the toast's dismiss swipe starts moving immediately and is purely vertical, so there's no
 *  timing or direction signal left to tell the two apart natively — the toast has to say so
 *  itself. No plugin exists on iOS/web/Electron; `setEnabled` calls there resolve to a no-op via
 *  the caught rejection below. */
interface PullToRefreshControlNative {
	setEnabled(options: { enabled: boolean }): Promise<void>;
}

function nativeClient(): PullToRefreshControlNative | null {
	if (!Capacitor.isNativePlatform()) return null;
	return Capacitor.registerPlugin<PullToRefreshControlNative>('PullToRefreshControl');
}

let suppressionCount = 0;

/**
 * Suppresses native pull-to-refresh for as long as the returned callback hasn't been invoked.
 * Reference-counted so overlapping callers (e.g. two undo toasts stacked back to back) don't
 * re-enable refresh out from under one another — refresh only comes back once every caller has
 * released. Safe to call repeatedly and to release more than once (extra releases are no-ops).
 */
export function suppressPullToRefresh(): () => void {
	const client = nativeClient();
	suppressionCount++;
	if (client && suppressionCount === 1) {
		client.setEnabled({ enabled: false }).catch(() => {});
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		suppressionCount--;
		if (client && suppressionCount === 0) {
			client.setEnabled({ enabled: true }).catch(() => {});
		}
	};
}
