import { ingressBase, stripIngressPrefix } from '$lib/api/ingress';

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
 * This must live in `hooks.ts` (SvelteKit's *universal* hooks file), not `hooks.client.ts` —
 * confirmed against SvelteKit's own source (`write_client_manifest.js`): the client's `reroute`
 * hook is wired up only from the universal hooks file. A `hooks.client.ts` export of the same
 * name is silently never called at all (only `handleError`/`init` are read from there) — this
 * app shipped with `reroute` in exactly that wrong, silently-inert location for a while, which is
 * why nothing under Ingress ever actually got past SvelteKit's own "page not found" for real,
 * despite every other fix (asset rewriting, the fixup service worker, etc.) working correctly.
 *
 * `reroute` only changes what the router uses to *match* a route — it does not touch the address
 * bar or `window.location`, so this is safe to run on every navigation, not just the first.
 * Outside Ingress `ingressBase()` is `''` and this is a no-op.
 *
 * SvelteKit resolves whatever this returns against the original URL (`new URL(returned, url)`),
 * so `url.search`/`url.hash` must be carried over explicitly or they're silently dropped from the
 * URL used for matching - this app reads query params (e.g. login's `?next=`,
 * reset-password's `?token=`) off `page.url`, which is built from that same resolved URL.
 *
 * `stripIngressPrefix` (shared with app code that needs the same "logical path" - see its own doc
 * comment) also collapses a doubled slash: Supervisor's own Ingress panel constructs the iframe's
 * `src` by concatenating a trailing-slash base with `ingress_entry`'s own leading slash, producing
 * a real, live-confirmed double slash (`/api/hassio_ingress/<token>//ha-ingress-entry`) - not
 * something this app controls or can fix at the source. Left un-normalized, stripping the base
 * leaves `//ha-ingress-entry`, which matches nothing in the route table (SvelteKit's own "Not
 * found" error, confirmed live) since no real route starts with a doubled slash.
 */
export function reroute({ url }: { url: URL }): string | void {
	const base = ingressBase();
	if (!base || !url.pathname.startsWith(base)) return;
	return stripIngressPrefix(url.pathname) + url.search + url.hash;
}
