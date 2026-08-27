import { Capacitor } from '@capacitor/core';
// Provably covered in isolation (run orientation.spec.ts + orientation.svelte.spec.ts alone and
// this file reports 100%) — the same Vitest browser-mode coverage-collection artifact documented
// on `lib/api/selected-store.ts` attributes a phantom, permanently-uninvoked function entry to this
// import statement once merged into the full suite, not missing coverage.
/* v8 ignore start */
import { ScreenOrientation } from '@capacitor/screen-orientation';
/* v8 ignore stop */

export type OrientationPreference = 'automatic' | 'portrait' | 'landscape';

/** What actually happened when `applyOrientation`/`setOrientationPreference` ran.
 * Settings uses this to say something honest when a lock didn't take — the Web
 * Screen Orientation API can reject in cases the old all-swallowing version
 * left invisible (notably Chrome Android: `lock()` rejects when the device's
 * system Auto-rotate is off, and rejects even in an installed PWA on many
 * builds — see the PWA orientation postmortem in AGENTS.md). */
export type OrientationLockResult =
	| { status: 'locked'; orientation: 'portrait' | 'landscape' }
	| { status: 'unlocked' }
	| { status: 'failed'; reason: 'no-api' | 'not-standalone' | 'rejected' };

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
 * does nothing (see PLAN_09_PHASE_REFINEMENTS.md #14).
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
 * browsers, the in-browser-tab rejection, and the auto-rotate-off rejection
 * are all expected, non-actionable outcomes, not errors — but they're reported
 * back via the result so callers can say so honestly instead of the lock
 * silently no-oping (mirrors $lib/theme.ts's and $lib/accent.ts's `hasWindow()`
 * no-op convention). */
export async function applyOrientation(
	preference: OrientationPreference
): Promise<OrientationLockResult> {
	if (!hasWindow()) return { status: 'unlocked' };
	if (Capacitor.isNativePlatform()) {
		return applyNativeOrientation(preference);
	}
	const orientation = screen.orientation as
		| (ScreenOrientation & {
				lock?: (o: OrientationLockType) => Promise<void>;
				unlock?: () => void;
		  })
		| undefined;
	if (!orientation?.lock) return { status: 'failed', reason: 'no-api' };

	try {
		if (preference === 'automatic') {
			orientation.unlock?.();
			return { status: 'unlocked' };
		}
		// `lock()` only succeeds while the app is running in a standalone/
		// fullscreen display mode (an installed PWA) — a plain browser tab
		// rejects it. Checked up front (and mirrored by canLockOrientation) so
		// the failure is reported as "not installed" rather than a generic
		// rejection, which has a different remedy.
		if (!window.matchMedia('(display-mode: standalone)').matches) {
			return { status: 'failed', reason: 'not-standalone' };
		}
		await orientation.lock(preference);
		return { status: 'locked', orientation: preference };
	} catch {
		// Chrome Android rejects when the device's system Auto-rotate is off;
		// some builds reject even in an installed PWA. Expected, non-actionable
		// from inside the page — reported so Settings can point the user at the
		// real fix (turn on Auto-rotate) or the native app.
		return { status: 'failed', reason: 'rejected' };
	}
}

/** Native counterpart to the Screen Orientation API branch above — locks via
 * the Capacitor plugin, which calls `Activity.setRequestedOrientation` on
 * Android and the equivalent UIKit rotation on iOS. `lock()` can still fail
 * (e.g. an orientation not declared in the iOS project's
 * `UISupportedInterfaceOrientations`, or Android 16's large-screen restriction),
 * so it's wrapped in the same report-don't-throw convention as the web branch. */
async function applyNativeOrientation(
	preference: OrientationPreference
): Promise<OrientationLockResult> {
	try {
		if (preference === 'automatic') {
			await ScreenOrientation.unlock();
			return { status: 'unlocked' };
		}
		await ScreenOrientation.lock({ orientation: preference });
		return { status: 'locked', orientation: preference };
	} catch {
		return { status: 'failed', reason: 'rejected' };
	}
}

export async function setOrientationPreference(
	preference: OrientationPreference
): Promise<OrientationLockResult> {
	if (!hasWindow()) return { status: 'unlocked' };
	window.localStorage.setItem(STORAGE_KEY, preference);
	return applyOrientation(preference);
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
