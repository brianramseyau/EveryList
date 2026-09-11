/**
 * Matches Supervisor's actual `X-Ingress-Path` format (`/api/hassio_ingress/<token>`). The token
 * is base64url (mixed-case letters, digits, `-`/`_`, no padding) - confirmed against a real
 * live header value, a 43-character token consistent with Python's `secrets.token_urlsafe(32)`.
 * (An earlier version of this pattern assumed a hex-only token, based on nothing but a guess -
 * that guess was wrong and silently broke every real Ingress request, always falling back to the
 * unmodified shell. Backed by a live value this time, not another guess - but still worth
 * treating as best-effort rather than a guaranteed-stable Supervisor implementation detail.)
 *
 * The header is normally Supervisor-generated, but it's still attacker-reachable input (a plain
 * HTTP header on a request this container accepts) fed into `rewriteHtmlForIngress()` below,
 * which splices it directly into HTML attributes, `import()` call sites, and a <script> body -
 * callers must check this before rewriting anything, and treat a non-match as "no ingress header
 * at all" (fall back to the unmodified shell), not attempt to sanitize/escape an arbitrary value
 * instead.
 */
const INGRESS_PATH_PATTERN = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]+$/

export function isValidIngressPath(path: string): boolean {
  return INGRESS_PATH_PATTERN.test(path)
}

/**
 * Rewrites the SPA shell (`200.html`) so it works when Home Assistant Supervisor's Ingress proxy
 * serves it under a per-install, random token path prefix. Supervisor strips that prefix
 * (`X-Ingress-Path`) before the request ever reaches this container, so the server itself doesn't
 * need to know about it for API routes - but every asset reference the SvelteKit build emits is
 * root-absolute (this app's `paths.relative: false`, apps/web/vite.config.ts), so the browser
 * resolves them against the real page URL and bypasses the prefix entirely unless rewritten here.
 * Two distinct HTML-text shapes need rewriting:
 *   - `<link href="/_app/...">` / any `src="/..."` attribute - ordinary HTML references.
 *   - `import("/_app/immutable/entry/start.js")` - adapter-static's actual bootstrap is a plain
 *     (non-module) inline `<script>` whose *body* dynamically imports the real entry chunk by a
 *     root-absolute string literal, not an HTML attribute at all.
 *
 * Also injects two things a client reads/uses at runtime:
 *   - `window.__EVERYLIST_INGRESS_BASE__` - read by apps/web/src/lib/api/base-url.ts so every
 *     API/realtime call is prefixed the same way.
 *   - Registration of `/_ha-ingress-sw.js` (below) - a service worker that fixes up requests
 *     neither of the two rewrites above can reach: SvelteKit's *lazily-loaded route chunks*
 *     (e.g. `nodes/0.js`, the root layout - needed to render literally any page) are looked up via
 *     Vite's `__vite__mapDeps` helper, a root-absolute string array baked directly into the
 *     compiled `app.js` at build time - not HTML text, so no text-level rewrite can reach it. Since
 *     `nodes/0.js` covers *every* route, this isn't a deep-link edge case - it blocked the very
 *     first real page render, confirmed live (a `nodes/0.js` request landing at the bare origin,
 *     404ing "from service worker", the same live session that surfaced this whole gap). This
 *     registration deliberately doesn't rely on `+layout.svelte`'s own lifecycle (`onMount` etc.) -
 *     `+layout.svelte` *is* `nodes/0.js`, so by the time it could run, the failure it exists to fix
 *     has already happened. Registering here, in the raw bootstrap HTML, runs before any chunk
 *     loading starts at all.
 *
 * Callers must have already checked `isValidIngressPath(ingressPath)` - this function trusts its
 * input completely and does no escaping of its own.
 */
export function rewriteHtmlForIngress(html: string, ingressPath: string): string {
  const prefixed = html
    .replace(/(src|href)="\/(?!\/)/g, (_match, attr: string) => `${attr}="${ingressPath}/`)
    .replace(/import\("\/(?!\/)/g, () => `import("${ingressPath}/`)

  const swUrl = JSON.stringify(`${ingressPath}/_ha-ingress-sw.js`)
  const swScope = JSON.stringify(`${ingressPath}/`)
  const globalScript = `<script>
window.__EVERYLIST_INGRESS_BASE__ = ${JSON.stringify(ingressPath)};
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(${swUrl}, { scope: ${swScope} }).then(function (reg) {
    function reloadOnce() {
      try {
        if (sessionStorage.getItem('everylist:haIngressSwReloaded') === '1') return;
        sessionStorage.setItem('everylist:haIngressSwReloaded', '1');
      } catch (e) { return; }
      location.reload();
    }
    var worker = reg.installing || reg.waiting || reg.active;
    if (!worker) return;
    if (worker.state === 'activated') { reloadOnce(); return; }
    worker.addEventListener('statechange', function () {
      if (worker.state === 'activated') reloadOnce();
    });
  }).catch(function () {});
}
</script>`
  const headTag = /<head(\s[^>]*)?>/i
  return headTag.test(prefixed)
    ? prefixed.replace(headTag, (match) => `${match}${globalScript}`)
    : globalScript + prefixed // no <head> (e.g. a minimal dev/test fixture) - safe to just lead with it
}
