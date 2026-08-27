/**
 * Forces a full reload — the app's SPA shell re-fetches every page's data fresh from the server
 * on remount, re-subscribes SSE, and re-runs the flush/connectivity startup checks. Backs the
 * sync status page's "Refresh now" button (PLAN_13_PHASE_NATIVE_APP_SHELL.md §4): Android's WebView doesn't offer a
 * pull-to-refresh gesture the way a normal mobile browser tab does, so there's otherwise no way
 * for a user to force a resync on demand short of force-quitting the app.
 */
/* v8 ignore start -- triggers a real page reload; same exclusion rationale as
   +layout.svelte's onNeedReload path and $lib/pwa/reset.ts's resetApp. */
export function refreshApp(): void {
	window.location.reload();
}
/* v8 ignore stop */
