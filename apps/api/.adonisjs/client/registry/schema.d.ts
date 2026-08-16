/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
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
