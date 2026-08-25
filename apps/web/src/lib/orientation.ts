import { Capacitor } from '@capacitor/core';
// Provably covered in isolation (run orientation.spec.ts + orientation.svelte.spec.ts alone and
// this file reports 100%) — the same Vitest browser-mode coverage-collection artifact documented
// on `lib/api/selected-store.ts` attributes a phantom, permanently-uninvoked function entry to this
// import statement once merged into the full suite, not missing coverage.
/* v8 ignore start */
import { ScreenOrientation } from '@capacitor/screen-orientation';
/* v8 ignore stop */

export type OrientationPreference = 'automatic' | 'portrait' | 'landscape';

const STORAGE_KEY = 'everylist:orientation';
const VALID_PREFERENCES: readonly OrientationPreference[] = ['automatic', 'portrait', 'landscape'];

/** Guards every browser API access — this module runs during prerendering
 * (Node, no `window`) as well as in the browser, like $lib/theme.ts and
 * $lib/accent.ts. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function isOrientationPreference(value: string | null): value is OrientationPreference {
	return value !== null && (VALID_PREFERENCES as string[]).includes(value);
}

export function getOrientationPreference(): OrientationPreference {
	if (!hasWindow()) return 'automatic';
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return isOrientationPreference(stored) ? stored : 'automatic';
}

/** `lock()` only succeeds while the app is running in a standalone/fullscreen
 * display mode (an installed PWA) — a plain browser tab rejects it. Settings
 * uses this to show an explanatory hint instead of a control that silently
 * does nothing (see PHASE9_PLAN.md #14).
 *
 * Native (Capacitor) builds are the exception: they lock via the
 * `@capacitor/screen-orientation` plugin, which doesn't care about display
 * mode, so it's always available there. */
export function canLockOrientation(): boolean {
	if (!hasWindow()) return false;
	if (Capacitor.isNativePlatform()) return true;
	return window.matchMedia('(display-mode: standalone)').matches;
}

/** Whether the Web Screen Orientation `lock()` API exists at all. Safari (iOS
 * and macOS) and Firefox never implement it, so on those browsers no amount of
 * installing-as-PWA will make the lock work — Settings uses this to show an
 * honest "not supported" note instead of the install-PWA hint (which would be
 * a dead end there). Distinct from canLockOrientation(), which answers "can it
 * lock *right now*"; this answers "can it ever lock, via the Web API". */
export function supportsScreenOrientationLock(): boolean {
	if (!hasWindow()) return false;
	return typeof screen.orientation?.lock === 'function';
}

/** Applies (or clears) the orientation lock. Native builds go through the
 * Capacitor screen-orientation plugin (the Web `screen.orientation.lock()` API
 * is unimplemented in iOS WKWebView and unreliable in Android's WebView); the
 * browser/PWA path uses the Screen Orientation API. Never throws: unsupported
 * browsers and the in-browser-tab rejection are both expected, no-op outcomes,
 * not errors — mirrors $lib/theme.ts's and $lib/accent.ts's `hasWindow()` no-op
 * convention. */
export async function applyOrientation(preference: OrientationPreference): Promise<void> {
	if (!hasWindow()) return;
	if (Capacitor.isNativePlatform()) {
		await applyNativeOrientation(preference);
		return;
	}
	const orientation = screen.orientation as
		| (ScreenOrientation & {
				lock?: (o: OrientationLockType) => Promise<void>;
				unlock?: () => void;
		  })
		| undefined;
	// Only reachable on a browser with no Screen Orientation API at all —
	// every real test browser (and every browser this PWA targets) has one,
	// so this can't be exercised without literally deleting the global.
	/* v8 ignore next */
	if (!orientation) return;

	try {
		if (preference === 'automatic') {
			orientation.unlock?.();
		} else {
			await orientation.lock?.(preference);
		}
	} catch {
		// Unsupported browser, or locked outside standalone/fullscreen mode —
		// both expected, non-actionable outcomes; see canLockOrientation().
	}
}

/** Native counterpart to the Screen Orientation API branch above — locks via
 * the Capacitor plugin, which calls `Activity.setRequestedOrientation` on
 * Android and the equivalent UIKit rotation on iOS. `lock()` can still fail
 * (e.g. an orientation not declared in the iOS project's
 * `UISupportedInterfaceOrientations`, or Android 16's large-screen restriction),
 * so it's wrapped in the same swallow-on-failure convention as the web branch. */
async function applyNativeOrientation(preference: OrientationPreference): Promise<void> {
	try {
		if (preference === 'automatic') {
			await ScreenOrientation.unlock();
		} else {
			await ScreenOrientation.lock({ orientation: preference });
		}
	} catch {
		// Orientation unavailable/undeclared — expected, non-actionable outcome.
	}
}

export async function setOrientationPreference(preference: OrientationPreference): Promise<void> {
	if (!hasWindow()) return;
	window.localStorage.setItem(STORAGE_KEY, preference);
	await applyOrientation(preference);
}

/** Re-applies whatever preference is already stored — called on app boot
 * (root layout `onMount`, alongside `initTheme`/`initAccent`) so a locked
 * orientation survives a reload of an already-installed PWA. Not part of
 * app.html's blocking bootstrap script like theme/accent are: unlike a dark
 * mode FOUC, there's no first-paint flash to avoid, and `lock()` is
 * inherently async. */
export async function initOrientation(): Promise<void> {
	if (!hasWindow()) return;
	await applyOrientation(getOrientationPreference());
}
