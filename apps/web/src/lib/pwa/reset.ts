/**
 * Unregisters every service worker and clears every Cache Storage entry for
 * this origin — the in-app equivalent of a devtools "unregister SW", for
 * users who can't reach devtools at all (a home-screen-installed PWA on
 * mobile is the main case: a stuck/corrupted precache entry survives normal
 * reloads and even the app's own auto-update check, and there's no on-device
 * way to clear it otherwise).
 */
export async function clearAppCaches(): Promise<void> {
	if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((registration) => registration.unregister()));
	}
	if (typeof caches !== 'undefined') {
		const keys = await caches.keys();
		await Promise.all(keys.map((key) => caches.delete(key)));
	}
}

/* v8 ignore start -- triggers a real page reload; same exclusion rationale as
   +layout.svelte's onNeedReload path (see vite.config.ts's coverage excludes). */
export async function resetApp(): Promise<void> {
	await clearAppCaches();
	window.location.reload();
}
/* v8 ignore stop */
