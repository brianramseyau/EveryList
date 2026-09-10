/**
 * Matches Supervisor's actual `X-Ingress-Path` format (`/api/hassio_ingress/<hex-token>`). The
 * header is normally Supervisor-generated, but it's still attacker-reachable input (a plain HTTP
 * header on a request this container accepts) fed into `rewriteHtmlForIngress()` below, which
 * splices it directly into HTML attributes and a <script> body - callers must check this before
 * rewriting anything, and treat a non-match as "no ingress header at all" (fall back to the
 * unmodified shell), not attempt to sanitize/escape an arbitrary value instead.
 */
const INGRESS_PATH_PATTERN = /^\/api\/hassio_ingress\/[a-f0-9]+$/i

export function isValidIngressPath(path: string): boolean {
  return INGRESS_PATH_PATTERN.test(path)
}

/**
 * Rewrites the SPA shell (`200.html`) so it works when Home Assistant Supervisor's Ingress proxy
 * serves it under a per-install, random token path prefix. Supervisor strips that prefix
 * (`X-Ingress-Path`) before the request ever reaches this container, so the server itself doesn't
 * need to know about it for API routes - but every asset reference the SvelteKit build emits
 * (`%sveltekit.head%`'s script/modulepreload tags, the manifest link) is root-absolute, so the
 * browser resolves them against the real page URL and bypasses the prefix entirely unless
 * rewritten here. Also injects a global the client reads at runtime (see
 * apps/web/src/lib/api/base-url.ts) so every API/realtime call is prefixed the same way. See
 * foundational/PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md for the full picture (why this is the only
 * HTML response that needs rewriting, and the deep-link limitation this doesn't cover).
 *
 * Callers must have already checked `isValidIngressPath(ingressPath)` - this function trusts its
 * input completely and does no escaping of its own.
 */
export function rewriteHtmlForIngress(html: string, ingressPath: string): string {
  const prefixed = html.replace(
    /(src|href)="\/(?!\/)/g,
    (_match, attr: string) => `${attr}="${ingressPath}/`
  )

  const globalScript = `<script>window.__EVERYLIST_INGRESS_BASE__ = ${JSON.stringify(ingressPath)};</script>`
  const headTag = /<head(\s[^>]*)?>/i
  return headTag.test(prefixed)
    ? prefixed.replace(headTag, (match) => `${match}${globalScript}`)
    : globalScript + prefixed // no <head> (e.g. a minimal dev/test fixture) - safe to just lead with it
}
