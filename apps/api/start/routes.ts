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
        router.delete(':listId/items/:itemId', [controllers.Items, 'destroy'])
        router.post(':listId/items/:itemId/restore', [controllers.Items, 'restore'])

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
      .use(middleware.auth())

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
