let registration: ServiceWorkerRegistration | undefined;

/** Wired from +layout.svelte's registerSW({ onRegisteredSW }) once the service worker is live. */
export function setUpdateRegistration(reg: ServiceWorkerRegistration | undefined): void {
	registration = reg;
}

export type UpdateCheckResult = 'updating' | 'up-to-date' | 'unavailable';

/**
 * Forces a network check for a new sw.js right now, instead of waiting on the browser's own
 * update heuristics — which on a home-screen-installed iOS PWA can go a long time between checks,
 * since there's no background tab keeping the SW's lifecycle ticking over. `registerType:
 * 'autoUpdate'` (vite.config.ts) takes it from there: if a new worker installs, it skips waiting
 * and activates on its own, and the onNeedReload handler already wired in +layout.svelte reloads
 * the page — this only needs to kick off the check.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
	if (!registration) return 'unavailable';
	await registration.update();
	return registration.installing || registration.waiting ? 'updating' : 'up-to-date';
}
