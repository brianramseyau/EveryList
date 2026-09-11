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

export interface IngressRemoteUser {
  id: string
  username: string
  displayName: string
}

/**
 * Supervisor's own Ingress proxy always connects from this fixed internal address on the add-on's
 * private `hassio` Docker network - documented directly by Home Assistant as the mechanism add-ons
 * MUST use to distinguish genuine Ingress traffic from anything else reaching the same port
 * (developers.home-assistant.io/docs/add-ons/presentation - "Only connections from 172.30.32.2
 * must be allowed. You should deny access to all other IP addresses.", with a sample nginx config
 * doing exactly `allow 172.30.32.2; deny all;`). `x-ingress-path` and the `X-Remote-User-*`
 * headers below are otherwise just attacker-controlled HTTP headers - Supervisor sets them when
 * proxying, but nothing stops a client reaching this container some other way from setting the
 * exact same headers itself. This add-on's optional direct port (`ha-addon/everylist/config.yaml`)
 * listens on the *same* container port `ingress_port` names, so without this IP check, enabling
 * that port would let any client on it forge a valid-looking `x-ingress-path` plus a linked HA
 * username and mint itself a real access token - a full authentication bypass, not merely a
 * cosmetic asset-path concern the way an unchecked `x-ingress-path` is for `rewriteHtmlForIngress`
 * below (which only ever changes what asset prefix gets served back to whoever asked, granting no
 * new privilege either way). Overridable via `SUPERVISOR_INGRESS_PROXY_IP` purely so the test
 * suite can exercise this against its own loopback client instead of the real Docker network
 * address - never meant to be set in a real deployment.
 */
function trustedIngressProxyIp(): string {
  return process.env.SUPERVISOR_INGRESS_PROXY_IP || '172.30.32.2'
}

/**
 * True when a request both originates from Supervisor's fixed Ingress proxy address and carries a
 * validly-formatted `x-ingress-path` — i.e. this is genuinely an Ingress-proxied request, whether
 * or not it also carries a specific visitor's `X-Remote-User-*` identity (see
 * `getValidatedRemoteUser` below for that stronger check). Used to scope the explicit
 * `auth_api`-backed sign-in (`ha_auth_controller.ts#login`) to Ingress only, matching what
 * PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md and DOCS.md both say about it — without this, that
 * endpoint (a credential-validation oracle against the user's real Home Assistant password) would
 * be reachable from anywhere the server itself is reachable, not just through Home Assistant.
 */
export function isGenuineIngressRequest(request: {
  header(name: string): string | undefined
  ip(): string
}): boolean {
  if (request.ip() !== trustedIngressProxyIp()) return false
  const ingressPath = request.header('x-ingress-path')
  return Boolean(ingressPath && isValidIngressPath(ingressPath))
}

/**
 * Extracts the Home-Assistant-authenticated visitor's identity from Supervisor's own
 * `X-Remote-User-Id` / `X-Remote-User-Name` / `X-Remote-User-Display-Name` headers — sent
 * unconditionally by Supervisor on every Ingress-proxied request whenever session data exists (no
 * add-on config flag required; confirmed against Supervisor's source,
 * home-assistant/supervisor#4152 and `HEADER_REMOTE_USER_*` in `supervisor/const.py`), used to
 * silently sign a linked user in with no login screen at all (`ha_auth_controller.ts`) and to
 * offer one-click account linking (`ha_link_controller.ts`).
 *
 * These headers only mean anything when the request genuinely came through Supervisor's Ingress
 * proxy. Two independent checks gate that, both required:
 *   - The request's source IP must be Supervisor's own fixed proxy address (see
 *     `trustedIngressProxyIp` above) - the only check that actually distinguishes a real
 *     Supervisor-proxied request from one a client sent directly (e.g. via the add-on's optional
 *     direct port, which shares the same container port).
 *   - `x-ingress-path` must also be present and match Supervisor's real format
 *     (`isValidIngressPath`) - kept as a second check (not a substitute for the IP check, which a
 *     forged header can't satisfy) since it's cheap and already validated elsewhere.
 * Either failing means treating the headers as absent entirely — never partially trust them. See
 * PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
 */
export function getValidatedRemoteUser(request: {
  header(name: string): string | undefined
  ip(): string
}): IngressRemoteUser | null {
  if (!isGenuineIngressRequest(request)) return null

  const id = request.header('x-remote-user-id')
  const username = request.header('x-remote-user-name')
  const displayName = request.header('x-remote-user-display-name')
  if (!id || !username) return null

  return { id, username, displayName: displayName || username }
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
