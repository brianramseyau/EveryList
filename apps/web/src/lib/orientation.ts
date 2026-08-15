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
 * does nothing (see PHASE9_PLAN.md #14). */
export function canLockOrientation(): boolean {
	if (!hasWindow()) return false;
	return window.matchMedia('(display-mode: standalone)').matches;
}

/** Applies (or clears) the orientation lock via the Screen Orientation API.
 * Never throws: unsupported browsers and the in-browser-tab rejection above
 * are both expected, no-op outcomes, not errors — mirrors $lib/theme.ts's
 * and $lib/accent.ts's `hasWindow()` no-op convention. */
export async function applyOrientation(preference: OrientationPreference): Promise<void> {
	if (!hasWindow()) return;
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
