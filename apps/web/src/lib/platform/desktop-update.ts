import { isDesktop } from './desktop';

/** Mirrors apps/desktop/lib/update-check.cjs's `UpdateCheckResult`, plus an 'unavailable' state
 * for when this is called outside the desktop build at all. */
export type DesktopUpdateCheckResult =
	| { status: 'update-available'; latestVersion: string; url: string }
	| { status: 'up-to-date' }
	| { status: 'error'; message: string }
	| { status: 'unavailable' };

/**
 * "Check and link", not an in-app auto-updater (PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §8 — unsigned
 * macOS builds can't auto-update at all). The actual GitHub Releases check runs in the main
 * process (apps/desktop/lib/update-check.cjs, over a real network fetch); this only relays it
 * through the preload bridge, so Settings' "Check for update" row can call one function
 * regardless of which build it's running in.
 */
export async function checkForDesktopUpdate(): Promise<DesktopUpdateCheckResult> {
	if (!isDesktop() || !window.everylistDesktop) return { status: 'unavailable' };
	return window.everylistDesktop.checkForUpdate();
}
