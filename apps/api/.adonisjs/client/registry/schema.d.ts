/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'event_stream': {
    methods: ["GET","HEAD"]
    pattern: '/__transmit/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'subscribe': {
    methods: ["POST"]
    pattern: '/__transmit/subscribe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'unsubscribe': {
    methods: ["POST"]
    pattern: '/__transmit/unsubscribe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'auth.new_account.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').signupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').signupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.access_tokens.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.password_reset.forgot': {
    methods: ["POST"]
    pattern: '/api/v1/auth/forgot-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/password_reset').forgotPasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/password_reset').forgotPasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['forgot']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['forgot']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.password_reset.reset': {
    methods: ["POST"]
    pattern: '/api/v1/auth/reset-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/password_reset').resetPasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/password_reset').resetPasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['reset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['reset']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
    }
  }
  'profile.profile.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/account/profile'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').updateProfileValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').updateProfileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.access_tokens.destroy': {
    methods: ["POST"]
    pattern: '/api/v1/account/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
    }
  }
  'profile.access_tokens.refresh': {
    methods: ["POST"]
    pattern: '/api/v1/account/refresh'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['refresh']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['refresh']>>>
    }
  }
  'metas.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/meta'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/metas_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/metas_controller').default['show']>>>
    }
  }
  'folders.folders.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/folders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['index']>>>
    }
  }
  'folders.folders.store': {
    methods: ["POST"]
    pattern: '/api/v1/folders'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/folder').createFolderValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/folder').createFolderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'folders.folders.reorder': {
    methods: ["PATCH"]
    pattern: '/api/v1/folders/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/folder').reorderFoldersValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/folder').reorderFoldersValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'folders.folders.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/folders/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/folder').updateFolderValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/folder').updateFolderValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'folders.folders.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/folders/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/folders_controller').default['destroy']>>>
    }
  }
  'lists.lists.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['index']>>>
    }
  }
  'lists.lists.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list').createListValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/list').createListValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.lists.reorder': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list').reorderListsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/list').reorderListsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.lists.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['show']>>>
    }
  }
  'lists.lists.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list').updateListValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/list').updateListValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.lists.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/lists_controller').default['destroy']>>>
    }
  }
  'lists.categories.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/categories'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['index']>>>
    }
  }
  'lists.categories.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/categories'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/category').createCategoryValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/category').createCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.categories.import': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/categories/import'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/category').importCategoriesValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/category').importCategoriesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['import']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['import']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.categories.reorder': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:listId/categories/reorder'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/category').reorderCategoriesValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/category').reorderCategoriesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['reorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['reorder']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.categories.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:listId/categories/:categoryId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/category').updateCategoryValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; categoryId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/category').updateCategoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.categories.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/categories/:categoryId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; categoryId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/categories_controller').default['destroy']>>>
    }
  }
  'lists.items.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/items'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['index']>>>
    }
  }
  'lists.items.recent': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/items/recent'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['recent']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['recent']>>>
    }
  }
  'lists.items.recent_names': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/items/recent-names'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['recentNames']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['recentNames']>>>
    }
  }
  'lists.items.categorize': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/items/categorize'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['categorize']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['categorize']>>>
    }
  }
  'lists.items.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/items'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/item').createItemValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/item').createItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.items.import': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/items/import'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/item').importItemsValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/item').importItemsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['import']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['import']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.items.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:listId/items/:itemId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/item').updateItemValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; itemId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/item').updateItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.items.move': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:listId/items/:itemId/move'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/item').moveItemValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; itemId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/item').moveItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['move']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['move']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.items.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/items/:itemId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; itemId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['destroy']>>>
    }
  }
  'lists.items.restore': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/items/:itemId/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; itemId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['restore']>>>
    }
  }
  'lists.items.purge': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/items/:itemId/purge'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; itemId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/items_controller').default['purge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/items_controller').default['purge']>>>
    }
  }
  'lists.stores.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/stores'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['index']>>>
    }
  }
  'lists.stores.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/stores'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/store').attachStoreValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/store').attachStoreValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.stores.detach': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/stores/:storeId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; storeId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['detach']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['detach']>>>
    }
  }
  'lists.favorite_items.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/favorites'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['index']>>>
    }
  }
  'lists.favorite_items.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/favorites'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/favorite_item').createFavoriteItemValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/favorite_item').createFavoriteItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.favorite_items.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:listId/favorites/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/favorite_item').updateFavoriteItemValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/favorite_item').updateFavoriteItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.favorite_items.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/favorites/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['destroy']>>>
    }
  }
  'lists.favorite_items.add_to_list': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/favorites/:id/add-to-list'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['addToList']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/favorite_items_controller').default['addToList']>>>
    }
  }
  'lists.list_members.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/members'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['index']>>>
    }
  }
  'lists.list_members.candidates': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/members/candidates'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['candidates']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['candidates']>>>
    }
  }
  'lists.list_members.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/members'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list_member').createListMemberValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/list_member').createListMemberValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.list_members.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/lists/:listId/members/:memberId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list_member').updateListMemberRoleValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; memberId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/list_member').updateListMemberRoleValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.list_members.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/members/:memberId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; memberId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_members_controller').default['destroy']>>>
    }
  }
  'lists.list_export.email': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/export/email'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list_export').emailExportValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/list_export').emailExportValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_export_controller').default['email']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_export_controller').default['email']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.list_invites.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/lists/:listId/invites'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_invites_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_invites_controller').default['index']>>>
    }
  }
  'lists.list_invites.store': {
    methods: ["POST"]
    pattern: '/api/v1/lists/:listId/invites'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/list_invite').createListInviteValidator)>>
      paramsTuple: [ParamValue]
      params: { listId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/list_invite').createListInviteValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_invites_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_invites_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'lists.list_invites.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/lists/:listId/invites/:inviteId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { listId: ParamValue; inviteId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/list_invites_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/list_invites_controller').default['destroy']>>>
    }
  }
  'tokens.personal_access_tokens.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['index']>>>
    }
  }
  'tokens.personal_access_tokens.store': {
    methods: ["POST"]
    pattern: '/api/v1/tokens'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/personal_access_token').createPersonalAccessTokenValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/personal_access_token').createPersonalAccessTokenValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tokens.personal_access_tokens.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/tokens/:tokenId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/personal_access_token').updatePersonalAccessTokenValidator)>>
      paramsTuple: [ParamValue]
      params: { tokenId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/personal_access_token').updatePersonalAccessTokenValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'tokens.personal_access_tokens.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/tokens/:tokenId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { tokenId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['destroy']>>>
    }
  }
  'personal_access_tokens.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/tokens/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/personal_access_tokens_controller').default['me']>>>
    }
  }
  'invite_accept.preview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/invites/:token'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invite_accept_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invite_accept_controller').default['preview']>>>
    }
  }
  'invite_accept.accept': {
    methods: ["POST"]
    pattern: '/api/v1/invites/:token/accept'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/invite_accept_controller').default['accept']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/invite_accept_controller').default['accept']>>>
    }
  }
  'stores.stores.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/stores/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/store').updateStoreValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/store').updateStoreValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'stores.stores.categories': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/stores/:id/categories'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['categories']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['categories']>>>
    }
  }
  'stores.stores.reorder_categories': {
    methods: ["PATCH"]
    pattern: '/api/v1/stores/:id/categories'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/store').reorderStoreCategoriesValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/store').reorderStoreCategoriesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['reorderCategories']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/stores_controller').default['reorderCategories']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
}
