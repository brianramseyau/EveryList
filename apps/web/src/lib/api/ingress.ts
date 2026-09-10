/** Guards every `window` access — this module runs during prerendering (Node, no `window`) as
 * well as in the browser, the same SSR/prerender guard `server-url.ts` already uses. */
function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

/**
 * The Home Assistant Ingress path prefix (`/api/hassio_ingress/<token>`), when this page was
 * served through Supervisor's Ingress proxy — injected as a global by apps/api's SPA-fallback
 * route (`#services/ingress_service`) only in that case, so this is `''` for every other build
 * (Docker/Unraid direct-port, PWA, native, desktop). See
 * foundational/PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
 */
export function ingressBase(): string {
	if (!hasWindow()) return '';
	return window.__EVERYLIST_INGRESS_BASE__ ?? '';
}

/** True while running inside Home Assistant's Ingress iframe. Installing a PWA / registering a
 * Service Worker pointed at a rotating per-install token URL isn't a coherent concept, so both
 * are skipped entirely under ingress rather than attempting to scope them to it — see
 * +layout.svelte. */
export function isIngress(): boolean {
	return ingressBase() !== '';
}

const RELOAD_ONCE_KEY = 'everylist:haIngressShadowSwReloaded';

/** Resolves once `worker` settles into a terminal state — `activated` (its `activate` handler's
 * `clients.claim()` has actually run — see the route this registers,
 * apps/api/start/routes.ts's `/_ha-ingress-shadow-sw.js`) or `redundant` (install failed, or a
 * newer registration superseded it before this one ever activated). Resolves `true`/`false`
 * accordingly so the caller can tell the two apart — reloading the page only helps in the
 * `activated` case; a `redundant` worker can't fix itself with a reload. Checks the already-terminal
 * case up front too, since a worker can already be `redundant` by the time this is called (not
 * just reach it later via `statechange`). Exported only so it's independently testable without a
 * real browser SW lifecycle — an implementation detail of `registerIngressShadowServiceWorker`
 * below, not meant to be used elsewhere. */
export function waitForActivation(worker: ServiceWorker): Promise<boolean> {
	if (worker.state === 'activated') return Promise.resolve(true);
	if (worker.state === 'redundant') return Promise.resolve(false);
	return new Promise((resolve) => {
		worker.addEventListener('statechange', function onStateChange() {
			if (worker.state !== 'activated' && worker.state !== 'redundant') return;
			worker.removeEventListener('statechange', onStateChange);
			resolve(worker.state === 'activated');
		});
	});
}

/**
 * Registers a trivial service worker scoped specifically to the Ingress path prefix, so it takes
 * precedence over Home Assistant's own root-scoped (`/`) service worker for this app's fetches —
 * a more specific registered scope always wins over a broader one. See
 * apps/api/start/routes.ts's `/_ha-ingress-shadow-sw.js` route and
 * foundational/PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md for why HA's own worker ends up controlling
 * this app's Ingress iframe at all.
 *
 * A freshly-registered worker's `clients.claim()` (in its `activate` handler) can take over an
 * already-open page immediately, without a reload — but only for fetches issued *after* that
 * completes; the handful of synchronous `<script src>`/modulepreload fetches the browser fires
 * while parsing the initial HTML have usually already raced past it by the time this resolves.
 * So: once this registration's worker reaches `activated` for the first time *this browser
 * session* (a `sessionStorage` flag guards against reloading on every subsequent open, or in a
 * loop), reload once so the reloaded page loads entirely under the shadow worker's control from
 * the start — the same reload-once idea `+layout.svelte`'s own `onNeedReload` handler already
 * uses for the real Workbox worker elsewhere in this app.
 *
 * `reload` is injectable (defaults to the real `window.location.reload`) purely for testing —
 * `location.reload` isn't a configurable property in a real browser, so it can't be stubbed with
 * `vi.spyOn` the way most other browser APIs in this codebase are.
 */
/* v8 ignore start */
function reloadPage(): void {
	window.location.reload();
}
/* v8 ignore stop */

export async function registerIngressShadowServiceWorker(
	reload: () => void = reloadPage
): Promise<void> {
	// No separate hasWindow() check needed - isIngress() already requires it (ingressBase() only
	// ever returns a non-empty value when window exists), so reaching here guarantees it does.
	if (!isIngress()) return;
	// Genuinely untestable in this project's real-Chromium test environment (vitest-browser via
	// Playwright) - `serviceWorker` is a Navigator.prototype accessor there, so deleting it as an
	// own property (the usual stub-absence trick elsewhere in this codebase, e.g.
	// pwa/push.svelte.spec.ts's afterEach) is a silent no-op; there's no supported browser left to
	// genuinely lack it either. Kept as a defensive guard, not dead code.
	/* v8 ignore next */
	if (!('serviceWorker' in navigator)) return;

	let registration: ServiceWorkerRegistration;
	try {
		registration = await navigator.serviceWorker.register(
			`${ingressBase()}/_ha-ingress-shadow-sw.js`,
			{ scope: `${ingressBase()}/` }
		);
	} catch {
		return; // best-effort - HA's own worker still serves the page, just possibly broken
	}

	const worker = registration.installing ?? registration.waiting ?? registration.active;
	const activated = worker ? await waitForActivation(worker) : true;
	// Install failed - HA's own worker still serves the page (just possibly broken the way it was
	// before this registration ever existed), and reloading again can't change that outcome.
	if (!activated) return;

	try {
		const alreadyReloaded = window.sessionStorage.getItem(RELOAD_ONCE_KEY) === '1';
		window.sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
		if (!alreadyReloaded) reload();
	} catch {
		// sessionStorage unavailable or full (e.g. privacy mode) - skip the reload rather than risk
		// reloading on every call with no way to remember it already happened, which would loop
		// forever since a full page reload re-runs this same code from scratch.
	}
}
