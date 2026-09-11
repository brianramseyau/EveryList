/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import app from '@adonisjs/core/services/app'
import { authThrottle, listsThrottle, passwordChangeThrottle } from '#start/limiter'
import { readFile } from 'node:fs/promises'
import { isValidIngressPath, rewriteHtmlForIngress } from '#services/ingress_service'
import logger from '@adonisjs/core/services/logger'

// Registers __transmit/events, __transmit/subscribe, and __transmit/unsubscribe
// (see #start/transmit) before this file's own SPA catch-all route below. This
// MUST be a static import, not a separate entry in adonisrc.ts's `preloads` —
// preload modules import concurrently via Promise.all, so which file's
// top-level code (and thus which routes get registered first) runs first is a
// race. matchit (the route matcher) returns the first pattern in registration
// order that matches, with no static-vs-wildcard prioritization, so losing
// that race silently sends every __transmit/* request to the catch-all below
// instead of the real SSE endpoint — this is exactly how the app shipped with
// realtime sync structurally never able to connect. A static import is part
// of this module's own synchronous dependency graph, which the ES module spec
// guarantees runs to completion before any of this file's own top-level code
// (i.e. router.get('*', ...) below) executes.
import '#start/transmit'

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
        router.post('forgot-password', [controllers.PasswordReset, 'forgot'])
        router.post('reset-password', [controllers.PasswordReset, 'reset'])
        // Home Assistant Ingress sign-in (PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md) — both share
        // this group's `authThrottle` below, important for `login-with-home-assistant`
        // specifically, since a successful guess there is a guess against the user's real HA
        // account password, not just an EveryList one.
        router.post('login-with-home-assistant', [controllers.HaAuth, 'login'])
        router.post('login-with-home-assistant-identity', [controllers.HaAuth, 'loginImplicit'])
      })
      .prefix('auth')
      .as('auth')
      // Unauthenticated (along with `setup` below) — the actual
      // brute-force/credential-stuffing/signup-spam surface. See
      // start/limiter.ts for why the SPA's authenticated traffic elsewhere
      // isn't throttled at all.
      .use(authThrottle)

    // First-run setup wizard — creates user id 1 and confirms initial server settings. Public
    // like the `auth` group above (and shares its throttle): `status` only reveals whether any
    // user has ever been created, and `store` re-checks that itself before acting, so it can
    // never succeed twice. See setup_controller.ts.
    router
      .group(() => {
        router.get('status', [controllers.Setup, 'status'])
        router.post('/', [controllers.Setup, 'store'])
      })
      .prefix('setup')
      .as('setup')
      .use(authThrottle)

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.patch('profile', [controllers.Profile, 'update'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
        router.post('refresh', [controllers.AccessTokens, 'refresh'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    // Kept out of the `account` group above so the throttle below can run
    // after auth resolves `ctx.auth.user` (needed to key it per-user) — see
    // start/limiter.ts for why this endpoint needs its own limit at all.
    router
      .patch('account/password', [controllers.Profile, 'updatePassword'])
      .use([middleware.auth(), passwordChangeThrottle])

    router.get('meta', [controllers.Metas, 'show'])

    // Runtime/environment diagnostics — see debug_controller.ts. Any authenticated user can
    // reach the route; the controller itself hard-codes the user id 1 check, since this app has
    // no admin role to gate on instead.
    router.get('debug', [controllers.Debug, 'show']).use(middleware.auth())

    // User management for the primary account — see admin_users_controller.ts. Same shape as
    // /debug above: any authenticated user can reach these routes, the controller itself
    // hard-codes the user id 1 check.
    router
      .group(() => {
        router.get('/', [controllers.AdminUsers, 'index'])
        router.post('/', [controllers.AdminUsers, 'store'])
        router.patch(':id', [controllers.AdminUsers, 'update'])
        router.delete(':id', [controllers.AdminUsers, 'destroy'])
      })
      .prefix('admin/users')
      .as('adminUsers')
      .use(middleware.auth())

    // Liveness probe for the frontend connectivity check (PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md): no
    // auth, no cache — the client treats 2xx + application/json as "reachable".
    router.get('ping', ({ response }) => response.ok({ pong: true }))

    router
      .group(() => {
        router.get('/', [controllers.Folders, 'index'])
        router.post('/', [controllers.Folders, 'store'])
        router.patch('/reorder', [controllers.Folders, 'reorder'])
        router.patch(':id', [controllers.Folders, 'update'])
        router.delete(':id', [controllers.Folders, 'destroy'])
      })
      .prefix('folders')
      .as('folders')
      .use(middleware.auth())

    router
      .group(() => {
        router.get('/', [controllers.Lists, 'index'])
        router.post('/', [controllers.Lists, 'store'])
        router.patch('/reorder', [controllers.Lists, 'reorder'])
        router.get(':id', [controllers.Lists, 'show'])
        router.patch(':id', [controllers.Lists, 'update'])
        router.delete(':id', [controllers.Lists, 'destroy'])
        router.get(':id/widget-snapshot', [controllers.Lists, 'widgetSnapshot'])

        router.get(':listId/categories', [controllers.Categories, 'index'])
        router.post(':listId/categories', [controllers.Categories, 'store'])
        router.post(':listId/categories/import', [controllers.Categories, 'import'])
        router.post(':listId/categories/bulk-import', [controllers.Categories, 'bulkImport'])
        router.patch(':listId/categories/reorder', [controllers.Categories, 'reorder'])
        router.patch(':listId/categories/:categoryId', [controllers.Categories, 'update'])
        router.delete(':listId/categories/:categoryId', [controllers.Categories, 'destroy'])

        router.get(':listId/items', [controllers.Items, 'index'])
        router.get(':listId/items/recent', [controllers.Items, 'recent'])
        router.get(':listId/items/recent-names', [controllers.Items, 'recentNames'])
        router.get(':listId/items/categorize', [controllers.Items, 'categorize'])
        router.post(':listId/items', [controllers.Items, 'store'])
        router.post(':listId/items/import', [controllers.Items, 'import'])
        router.patch(':listId/items/:itemId', [controllers.Items, 'update'])
        router.patch(':listId/items/:itemId/move', [controllers.Items, 'move'])
        router.post(':listId/items/:itemId/move-to-list', [controllers.Items, 'moveToList'])
        router.delete(':listId/items/:itemId', [controllers.Items, 'destroy'])
        router.post(':listId/items/:itemId/restore', [controllers.Items, 'restore'])
        router.delete(':listId/items/:itemId/purge', [controllers.Items, 'purge'])

        router.get(':listId/category-learnings', [controllers.CategoryLearnings, 'index'])

        router.get(':listId/stores', [controllers.Stores, 'index'])
        router.post(':listId/stores', [controllers.Stores, 'store'])
        router.delete(':listId/stores/:storeId', [controllers.Stores, 'detach'])

        router.get(':listId/favorites', [controllers.FavoriteItems, 'index'])
        router.post(':listId/favorites', [controllers.FavoriteItems, 'store'])
        router.patch(':listId/favorites/:id', [controllers.FavoriteItems, 'update'])
        router.delete(':listId/favorites/:id', [controllers.FavoriteItems, 'destroy'])
        router.post(':listId/favorites/:id/add-to-list', [controllers.FavoriteItems, 'addToList'])

        router.get(':listId/members', [controllers.ListMembers, 'index'])
        router.get(':listId/members/candidates', [controllers.ListMembers, 'candidates'])
        router.post(':listId/members', [controllers.ListMembers, 'store'])
        router.patch(':listId/members/:memberId', [controllers.ListMembers, 'update'])
        router.delete(':listId/members/:memberId', [controllers.ListMembers, 'destroy'])

        router.post(':listId/export/email', [controllers.ListExport, 'email'])

        router.get(':listId/invites', [controllers.ListInvites, 'index'])
        router.post(':listId/invites', [controllers.ListInvites, 'store'])
        router.delete(':listId/invites/:inviteId', [controllers.ListInvites, 'destroy'])
      })
      .prefix('lists')
      .as('lists')
      // Accepts a login session token or a Personal Access Token (Home
      // Assistant/Alexa-style integrations) — ListPolicy reduces a PAT's
      // effective role down to its encoded per-list grant either way.
      // Throttled per-token since this is the surface exposed to always-on
      // external clients — see start/limiter.ts.
      .use([middleware.auth({ guards: ['api', 'pat'] }), listsThrottle])

    router
      .group(() => {
        router.get('/', [controllers.PersonalAccessTokens, 'index'])
        router.post('/', [controllers.PersonalAccessTokens, 'store'])
        router.patch(':tokenId', [controllers.PersonalAccessTokens, 'update'])
        router.delete(':tokenId', [controllers.PersonalAccessTokens, 'destroy'])
      })
      .prefix('tokens')
      .as('tokens')
      // A token belongs to an account, not a single list — one token can be
      // scoped to several lists (see ListPolicy's grant-per-ability model).
      // Login-session only: minting more tokens from a PAT isn't allowed
      // (also structurally blocked — a PAT can never satisfy the 'owner'
      // check `store` requires, since its effective role is always capped
      // at editor/viewer).
      .use(middleware.auth())

    router
      .group(() => {
        router.get('/', [controllers.AlexaPreferences, 'show'])
        router.patch('/', [controllers.AlexaPreferences, 'update'])
      })
      .prefix('alexa/preferences')
      .as('alexaPreferences')
      // Settings → Alexa in the web app — login-session only, unlike the skill's own
      // `alexa/*` request-signature-verified group below (this is a normal browser request,
      // reusing the same `alexa_preferences` row `services/alexa/*` reads/writes).
      .use(middleware.auth())

    router
      .group(() => {
        router.get('/', [controllers.HaLink, 'show'])
        router.patch('/', [controllers.HaLink, 'update'])
      })
      .prefix('ha-link')
      .as('haLink')
      // Settings → Home Assistant in the web app — the signed-in user's own account link.
      // `authThrottle` here too (not just on the explicit login endpoint): manually linking a
      // username other than the caller's own detected identity verifies a real Home Assistant
      // password (ha_link_controller.ts), the same credential-guessing surface login-with-home-
      // assistant is. See PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
      .use([middleware.auth(), authThrottle])

    // PAT-only self-introspection — a login session can't authenticate here
    // (it has no per-list "grant" to report), so this sits outside the
    // `tokens` group above rather than sharing its guard config. See
    // PersonalAccessTokensController#me.
    router
      .get('tokens/me', [controllers.PersonalAccessTokens, 'me'])
      .use(middleware.auth({ guards: ['pat'] }))

    router
      .group(() => {
        // Reached directly by Amazon's servers with a signed request, not a
        // login/PAT bearer token — auth is handled inside the controller by
        // verifying the account-linked PAT embedded in the request body
        // (see alexa_controller.ts). Amazon requires signature verification
        // instead of Lambda's free IAM check, since this skill uses a direct
        // HTTPS endpoint (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 2).
        router.post('/', [controllers.Alexa, 'handle']).use(middleware.alexaSignature())
        // Amazon's account-linking "Access Token URI" — a plain OAuth2
        // client-credentials-style exchange bridging to Authentik, not
        // signed the way skill requests are.
        router.post('oauth/token', [controllers.AlexaOauth, 'token'])
        // Category/list icons for the APL visual display — a plain public image URL Alexa's
        // renderer fetches directly, not a signed skill request.
        router.get('icons/:name', [controllers.AlexaIcons, 'show'])
      })
      .prefix('alexa')
      .as('alexa')

    router.get('invites/:token', [controllers.InviteAccept, 'preview'])
    router
      .post('invites/:token/accept', [controllers.InviteAccept, 'accept'])
      .use(middleware.auth())

    router
      .group(() => {
        router.patch(':id', [controllers.Stores, 'update'])
        router.get(':id/categories', [controllers.Stores, 'categories'])
        router.patch(':id/categories', [controllers.Stores, 'reorderCategories'])
        router.delete(':id/categories', [controllers.Stores, 'resetCategories'])
      })
      .prefix('stores')
      .as('stores')
      .use(middleware.auth())

    // Instance-wide, not per-list. Any authenticated user can reach these routes; the
    // controller itself hard-codes the user id 1 check (see backup_settings_controller.ts) —
    // same shape as /debug and /admin/users above, since backups expose the raw database file.
    router
      .group(() => {
        router.get('/', [controllers.BackupSettings, 'show'])
        router.patch('/', [controllers.BackupSettings, 'update'])
        router.post('run', [controllers.BackupSettings, 'run'])
        router.get('download/:filename', [controllers.BackupSettings, 'download'])
      })
      .prefix('backup-settings')
      .as('backupSettings')
      .use(middleware.auth())

    // Instance-wide server settings backed by /config/config.yaml — mail, public signups, Alexa
    // account-linking (see server_config.ts). Same shape as /backup-settings above: any
    // authenticated user can reach these routes, the controller itself hard-codes the user id 1
    // check.
    router
      .group(() => {
        router.get('/', [controllers.ServerConfig, 'show'])
        router.patch('/', [controllers.ServerConfig, 'update'])
      })
      .prefix('server-config')
      .as('serverConfig')
      .use(middleware.auth())

    router
      .group(() => {
        router.get('public-key', [controllers.PushSubscriptions, 'publicKey'])
        router
          .post('subscriptions', [controllers.PushSubscriptions, 'store'])
          .use(middleware.auth())
        router
          .delete('subscriptions/:id', [controllers.PushSubscriptions, 'destroy'])
          .use(middleware.auth())
      })
      .prefix('push')
      .as('push')
  })
  .prefix('/api/v1')

/**
 * Fixes up Ingress requests neither of ingress_service.ts's HTML-text rewrites can reach:
 * SvelteKit's compiled `app.js` looks up lazily-loaded route chunks (e.g. `nodes/0.js`, the root
 * layout - needed for literally any page) via a root-absolute string baked in at build time, not
 * HTML text. That request bypasses the Ingress prefix entirely and 404s at Home Assistant's own
 * root, not this container - confirmed live, and not a deep-link edge case, since `nodes/0.js`
 * blocks the very first page render. This worker's only job: for a same-origin request under
 * `/_app/` that landed outside its own (Ingress-prefixed) scope, refetch it with the scope
 * prepended instead. Registered from the bootstrap HTML itself (see rewriteHtmlForIngress) rather
 * than from `+layout.svelte`, since `+layout.svelte` *is* `nodes/0.js` - it can't register in time
 * to fix its own load failure.
 *
 * Registered before the `*` SPA fallback below - matchit (the route matcher) returns the first
 * pattern in registration order that matches, with no static-vs-wildcard prioritization (see this
 * file's own top comment on the __transmit routes for exactly this footgun), so this would never
 * be reached if it came after the wildcard.
 */
router.get('/_ha-ingress-sw.js', ({ response }) => {
  response.header('content-type', 'text/javascript; charset=utf-8')
  return response.send(
    `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const scope = new URL(self.registration.scope);
  const reqUrl = new URL(event.request.url);
  if (
    reqUrl.origin === scope.origin &&
    reqUrl.pathname.startsWith('/_app/') &&
    !reqUrl.pathname.startsWith(scope.pathname)
  ) {
    const rewritten = scope.origin + scope.pathname.replace(/\\/$/, '') + reqUrl.pathname;
    event.respondWith(fetch(new Request(rewritten, event.request)));
  }
});
`
  )
})

/**
 * SPA fallback: apps/web is built with adapter-static's `fallback: '200.html'`
 * (see apps/web/vite.config.ts) so routes with no known params at build time
 * (e.g. /lists/:id) aren't prerendered. Static files under public/ (prerendered
 * pages, /_app/* assets) are served by the static middleware — which runs
 * before routing — so this only ever fires for a path that isn't a real file,
 * letting SvelteKit's client-side router take over. A stray /api/v1/* miss
 * still 404s as JSON instead of getting the HTML shell.
 *
 * Also doubles as the Home Assistant add-on's Ingress entry point
 * (ha-addon/everylist/config.yaml's `ingress_entry: /ha-ingress-entry` -
 * apps/web/src/routes/ha-ingress-entry/ is a real route the client router
 * recognizes post-hydration, but deliberately excluded from prerendering so
 * it always falls through to here instead of the static middleware, which
 * has no per-request customization hook). When Supervisor's ingress proxy
 * is in front of this request (`x-ingress-path` header - stripped before
 * reaching this container otherwise) and its value matches Supervisor's
 * actual format, the shell gets rewritten so its root-absolute asset
 * references resolve under that proxy's prefix instead of 404ing - see
 * #services/ingress_service and foundational/PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
 * No header, or a header that doesn't match the expected format (untrusted
 * input - see isValidIngressPath) → byte-identical to the plain
 * `response.download` this replaced; every other route (prerendered pages,
 * /api/*) is untouched.
 */
router.get('*', async ({ request, response }) => {
  if (request.url().startsWith('/api/')) {
    return response.notFound({ message: 'Not found' })
  }

  // This response's bytes depend on a request header (x-ingress-path), not just the URL, and the
  // Ingress branch below only sets `Vary` for that - a browser's *heuristic* freshness caching
  // (kicking in whenever no explicit Cache-Control is present, based on this file's on-disk
  // mtime - fixed at image-build time, so potentially "fresh" for a long time) doesn't consult
  // `Vary` at all before deciding to skip the network entirely. That's exactly what produced a
  // live "200 (from disk cache)" response still carrying pre-fix, un-rewritten asset paths well
  // after the underlying file had already changed. `no-store` forces every request through to
  // this handler, which is the whole point of a dynamic SPA-fallback route in the first place.
  response.header('cache-control', 'no-store')

  const ingressPath = request.header('x-ingress-path')
  if (!ingressPath || !isValidIngressPath(ingressPath)) {
    // A present-but-rejected header (as opposed to no header at all) means either a malicious
    // request or Supervisor's real token format has drifted from what isValidIngressPath expects -
    // worth a log line since the fallback silently serves the un-rewritten shell either way, which
    // would otherwise look identical to "not behind Ingress at all" and be hard to diagnose. Never
    // logs the header's own content, though - it's unvalidated attacker-reachable input on a
    // public, unauthenticated, unthrottled route, so echoing it back verbatim would let any client
    // inject arbitrary bytes into the log stream or pad it out on repeated requests.
    if (ingressPath)
      logger.warn(
        { ingressPathLength: ingressPath.length },
        'rejected x-ingress-path header, unrewritten shell served'
      )
    return response.download(app.publicPath('200.html'))
  }

  const html = await readFile(app.publicPath('200.html'), 'utf-8')
  response.header('content-type', 'text/html; charset=utf-8')
  response.header('vary', 'x-ingress-path')
  return response.send(rewriteHtmlForIngress(html, ingressPath))
})
