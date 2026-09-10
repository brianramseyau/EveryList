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
