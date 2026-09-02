import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/cors'

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * Enable or disable CORS handling globally.
   */
  enabled: true,

  /**
   * In development, allow every origin to simplify local front/backend setup.
   * In production, the PWA/browser build is same-origin (no CORS needed). The Capacitor native
   * app's WebView origins are `capacitor://localhost` on iOS and `https://localhost` on Android
   * (see foundational/PLAN_13_PHASE_NATIVE_APP_SHELL.md §1). The Electron desktop app serves its
   * renderer from a fixed-port loopback HTTP server rather than a single fixed origin — the port
   * is user-overridable via its own config.json (PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §2) — so a
   * predicate is used there instead of a third literal, which keeps that override (and any future
   * default-port change) working without requiring users to upgrade their server.
   *
   * Security note, stated honestly: this lets any page served from the user's own loopback
   * interface make cross-origin requests to this server. Every route the app actually calls
   * authenticates with a bearer token from `localStorage` (see config/auth.ts's `api`/`pat` token
   * guards), which a different loopback origin cannot read — so a CORS entry alone grants
   * nothing. The `web` session-cookie guard also exists in this app; it isn't used by the
   * API routes the desktop/native clients call, so this predicate is not extended to it.
   */
  origin: app.inDev
    ? true
    : (origin: string) =>
        origin === 'capacitor://localhost' ||
        origin === 'https://localhost' ||
        /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin),

  /**
   * HTTP methods accepted for cross-origin requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Reflect request headers by default. Use a string array to restrict
   * allowed headers.
   */
  headers: true,

  /**
   * Response headers exposed to the browser.
   */
  exposeHeaders: [],

  /**
   * Allow cookies/authorization headers on cross-origin requests.
   */
  credentials: true,

  /**
   * Cache CORS preflight response for N seconds. Raised from the AdonisJS default of 90s: the
   * native/desktop clients (see the `origin` predicate above) are cross-origin and send an
   * `Authorization` header on every request, which forces a preflight `OPTIONS` round trip ahead
   * of it. A short cache meant that round trip repeated on almost every app reopen even within
   * the same short session — 24h keeps a given endpoint's preflight valid across a normal day of
   * use while the WebView process stays alive, without meaningfully weakening the CORS policy
   * (see the security note above: this only caches "is this origin/header/method combo allowed",
   * which doesn't change from request to request).
   */
  maxAge: 86400,
})

export default corsConfig
