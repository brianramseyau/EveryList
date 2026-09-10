import { ingressBase } from '$lib/api/ingress';

/**
 * Under Home Assistant Ingress, the browser's actual, navigated URL always carries the
 * per-install `/api/hassio_ingress/<token>` prefix — that's the real address the iframe's `src`
 * pointed it at. Supervisor strips that prefix server-side before forwarding the request to this
 * container (see apps/api/app/services/ingress_service.ts), but the browser itself never learns
 * that happened, so `window.location.pathname` (and therefore what SvelteKit's client router
 * tries to match against this app's route table) still includes it. Nothing in this app's route
 * table knows about a random per-install token, so without this hook every Ingress request would
 * fail to match any route and render SvelteKit's own 404 — this is what actually made
 * `ha-ingress-entry` (and every route after it) unreachable under Ingress.
 *
 * `reroute` only changes what the router uses to *match* a route — it does not touch the address
 * bar or `window.location`, so this is safe to run on every navigation, not just the first.
 * Outside Ingress `ingressBase()` is `''` and this is a no-op.
 *
 * SvelteKit resolves whatever this returns against the original URL (`new URL(returned, url)`),
 * so `url.search`/`url.hash` must be carried over explicitly or they're silently dropped from the
 * URL used for matching - this app reads query params (e.g. login's `?next=`,
 * reset-password's `?token=`) off `page.url`, which is built from that same resolved URL.
 */
export function reroute({ url }: { url: URL }): string | void {
	const base = ingressBase();
	if (!base || !url.pathname.startsWith(base)) return;
	return (url.pathname.slice(base.length) || '/') + url.search + url.hash;
}
