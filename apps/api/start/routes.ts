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

router.get('/', () => {
  return { hello: 'world' }
})

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
        router.post('refresh', [controllers.AccessTokens, 'refresh'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    router.get('meta', [controllers.Metas, 'show'])

    router
      .group(() => {
        router.get('/', [controllers.Lists, 'index'])
        router.post('/', [controllers.Lists, 'store'])
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
        router.post(':listId/items', [controllers.Items, 'store'])
        router.post(':listId/items/import', [controllers.Items, 'import'])
        router.patch(':listId/items/:itemId', [controllers.Items, 'update'])
        router.delete(':listId/items/:itemId', [controllers.Items, 'destroy'])
        router.post(':listId/items/:itemId/restore', [controllers.Items, 'restore'])

        router.get(':listId/stores', [controllers.Stores, 'index'])
        router.post(':listId/stores', [controllers.Stores, 'store'])
        router.delete(':listId/stores/:storeId', [controllers.Stores, 'detach'])
      })
      .prefix('lists')
      .as('lists')
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

    router
      .group(() => {
        router.get('/', [controllers.FavoriteItems, 'index'])
        router.post('/', [controllers.FavoriteItems, 'store'])
        router.patch(':id', [controllers.FavoriteItems, 'update'])
        router.delete(':id', [controllers.FavoriteItems, 'destroy'])
        router.post(':id/add-to-list/:listId', [controllers.FavoriteItems, 'addToList'])
      })
      .prefix('favorites')
      .as('favorites')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
