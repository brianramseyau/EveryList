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
import { authThrottle, listsThrottle } from '#start/limiter'

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
      })
      .prefix('auth')
      .as('auth')
      // The only unauthenticated endpoints on the API — the actual
      // brute-force/credential-stuffing/signup-spam surface. See
      // start/limiter.ts for why the SPA's authenticated traffic elsewhere
      // isn't throttled at all.
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

    router.get('meta', [controllers.Metas, 'show'])

    // Liveness probe for the frontend connectivity check (PHASE14_PLAN.md): no
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
        router.delete(':listId/items/:itemId', [controllers.Items, 'destroy'])
        router.post(':listId/items/:itemId/restore', [controllers.Items, 'restore'])
        router.delete(':listId/items/:itemId/purge', [controllers.Items, 'purge'])

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
        // HTTPS endpoint (PHASE16_PLAN.md Stage 2).
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
      })
      .prefix('stores')
      .as('stores')
      .use(middleware.auth())

    // Instance-wide, not per-list — there's no admin role in this app, so any
    // authenticated user can view/change the shared backup schedule.
    router
      .group(() => {
        router.get('/', [controllers.BackupSettings, 'show'])
        router.patch('/', [controllers.BackupSettings, 'update'])
        router.post('run', [controllers.BackupSettings, 'run'])
      })
      .prefix('backup-settings')
      .as('backupSettings')
      .use(middleware.auth())
  })
  .prefix('/api/v1')

/**
 * SPA fallback: apps/web is built with adapter-static's `fallback: '200.html'`
 * (see apps/web/vite.config.ts) so routes with no known params at build time
 * (e.g. /lists/:id) aren't prerendered. Static files under public/ (prerendered
 * pages, /_app/* assets) are served by the static middleware — which runs
 * before routing — so this only ever fires for a path that isn't a real file,
 * letting SvelteKit's client-side router take over. A stray /api/v1/* miss
 * still 404s as JSON instead of getting the HTML shell.
 */
router.get('*', ({ request, response }) => {
  if (request.url().startsWith('/api/')) {
    return response.notFound({ message: 'Not found' })
  }
  return response.download(app.publicPath('200.html'))
})
