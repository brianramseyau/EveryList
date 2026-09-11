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

const IMPLICIT_HA_SIGN_IN_SUPPRESSED_KEY = 'everylist:haImplicitSignInSuppressed';

/**
 * Marks this browser session as "don't silently sign back in" — set by `logout()` when a linked
 * user explicitly logs out under Ingress, so `+layout.svelte`'s implicit sign-in
 * (`attemptImplicitHaSignIn`) doesn't immediately reclaim the session on the very next Ingress
 * page load, which would otherwise make "log out" a no-op for anyone whose HA account is linked.
 * `sessionStorage`, not `localStorage`: the suppression only needs to survive this tab/session,
 * the same durability choice `ingress_service.ts`'s SW-reload-once flag already uses for a similar
 * "only matters for the current session" case.
 */
export function suppressImplicitHaSignIn(): void {
	if (!hasWindow()) return;
	try {
		window.sessionStorage.setItem(IMPLICIT_HA_SIGN_IN_SUPPRESSED_KEY, '1');
	} catch {
		// Storage unavailable (private browsing, etc.) — implicit sign-in staying re-enabled is a
		// minor inconvenience, not worth failing logout over.
	}
}

/** See `suppressImplicitHaSignIn` above. */
export function isImplicitHaSignInSuppressed(): boolean {
	if (!hasWindow()) return false;
	try {
		return window.sessionStorage.getItem(IMPLICIT_HA_SIGN_IN_SUPPRESSED_KEY) === '1';
	} catch {
		return false;
	}
}

/**
 * Strips the Ingress prefix (if any) from a pathname, collapsing any doubled slash Supervisor's
 * own Ingress panel can produce (see hooks.ts's `reroute`, which uses this same logic to decide
 * which route to render).
 *
 * Use this instead of comparing `page.url.pathname` directly anywhere app code needs the
 * "logical" in-app path. `page.url` always reflects the real, unmodified browser URL — confirmed
 * against SvelteKit's own client runtime (`reroute()` only changes what the *router* uses to
 * match a route; `page.url` is set from the original, un-rerouted URL) — so a raw comparison
 * against an unprefixed path (e.g. `page.url.pathname === '/setup'`) never matches while the
 * address bar still carries the Ingress prefix, even once `reroute()` has the router itself
 * showing the right page. Outside Ingress this is a no-op passthrough.
 */
export function stripIngressPrefix(pathname: string): string {
	const base = ingressBase();
	if (!base || !pathname.startsWith(base)) return pathname;
	return pathname.slice(base.length).replace(/^\/+/, '/') || '/';
}
