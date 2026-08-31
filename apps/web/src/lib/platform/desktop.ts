import { Capacitor } from '@capacitor/core';

/** Guards every `window` access — this module runs during prerendering (Node, no `window`) as
 * well as in the browser, the same SSR/prerender guard `token.ts`/`server-url.ts` already use. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

/** True only when the preload script actually ran and exposed the bridge — not merely that a
 * desktop-branching code path compiled (see PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §1's Phase 13
 * `SceneDelegate` lesson: a typo'd preload path fails silently otherwise). */
export function isDesktop(): boolean {
	if (!hasWindow()) return false;
	return Boolean(window.everylistDesktop);
}

export function desktopInfo(): { version: string; platform: string } | null {
	if (!hasWindow()) return null;
	const bridge = window.everylistDesktop;
	return bridge ? { version: bridge.version, platform: bridge.platform } : null;
}

/** True for any build that talks to a server over the network and must be told where it is —
 * Capacitor (PLAN_13_PHASE_NATIVE_APP_SHELL.md §1) and Electron (PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md
 * §1) alike, as opposed to the Docker/PWA build, which is always same-origin. Introduced instead
 * of repeating `Capacitor.isNativePlatform() || isDesktop()` at every call site. */
export function isRemoteClient(): boolean {
	return Capacitor.isNativePlatform() || isDesktop();
}
