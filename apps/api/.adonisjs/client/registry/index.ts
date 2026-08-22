/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'event_stream': {
    methods: ["GET","HEAD"],
    pattern: '/__transmit/events',
    tokens: [{"old":"/__transmit/events","type":0,"val":"__transmit","end":""},{"old":"/__transmit/events","type":0,"val":"events","end":""}],
    types: placeholder as Registry['event_stream']['types'],
  },
  'subscribe': {
    methods: ["POST"],
    pattern: '/__transmit/subscribe',
    tokens: [{"old":"/__transmit/subscribe","type":0,"val":"__transmit","end":""},{"old":"/__transmit/subscribe","type":0,"val":"subscribe","end":""}],
    types: placeholder as Registry['subscribe']['types'],
  },
  'unsubscribe': {
    methods: ["POST"],
    pattern: '/__transmit/unsubscribe',
    tokens: [{"old":"/__transmit/unsubscribe","type":0,"val":"__transmit","end":""},{"old":"/__transmit/unsubscribe","type":0,"val":"unsubscribe","end":""}],
    types: placeholder as Registry['unsubscribe']['types'],
  },
  'auth.new_account.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['auth.new_account.store']['types'],
  },
  'auth.access_tokens.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.access_tokens.store']['types'],
  },
  'auth.password_reset.forgot': {
    methods: ["POST"],
    pattern: '/api/v1/auth/forgot-password',
    tokens: [{"old":"/api/v1/auth/forgot-password","type":0,"val":"api","end":""},{"old":"/api/v1/auth/forgot-password","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/forgot-password","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/forgot-password","type":0,"val":"forgot-password","end":""}],
    types: placeholder as Registry['auth.password_reset.forgot']['types'],
  },
  'auth.password_reset.reset': {
    methods: ["POST"],
    pattern: '/api/v1/auth/reset-password',
    tokens: [{"old":"/api/v1/auth/reset-password","type":0,"val":"api","end":""},{"old":"/api/v1/auth/reset-password","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/reset-password","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/reset-password","type":0,"val":"reset-password","end":""}],
    types: placeholder as Registry['auth.password_reset.reset']['types'],
  },
  'profile.profile.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/account/profile',
    tokens: [{"old":"/api/v1/account/profile","type":0,"val":"api","end":""},{"old":"/api/v1/account/profile","type":0,"val":"v1","end":""},{"old":"/api/v1/account/profile","type":0,"val":"account","end":""},{"old":"/api/v1/account/profile","type":0,"val":"profile","end":""}],
    types: placeholder as Registry['profile.profile.show']['types'],
  },
  'profile.profile.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/account/profile',
    tokens: [{"old":"/api/v1/account/profile","type":0,"val":"api","end":""},{"old":"/api/v1/account/profile","type":0,"val":"v1","end":""},{"old":"/api/v1/account/profile","type":0,"val":"account","end":""},{"old":"/api/v1/account/profile","type":0,"val":"profile","end":""}],
    types: placeholder as Registry['profile.profile.update']['types'],
  },
  'profile.access_tokens.destroy': {
    methods: ["POST"],
    pattern: '/api/v1/account/logout',
    tokens: [{"old":"/api/v1/account/logout","type":0,"val":"api","end":""},{"old":"/api/v1/account/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/account/logout","type":0,"val":"account","end":""},{"old":"/api/v1/account/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['profile.access_tokens.destroy']['types'],
  },
  'profile.access_tokens.refresh': {
    methods: ["POST"],
    pattern: '/api/v1/account/refresh',
    tokens: [{"old":"/api/v1/account/refresh","type":0,"val":"api","end":""},{"old":"/api/v1/account/refresh","type":0,"val":"v1","end":""},{"old":"/api/v1/account/refresh","type":0,"val":"account","end":""},{"old":"/api/v1/account/refresh","type":0,"val":"refresh","end":""}],
    types: placeholder as Registry['profile.access_tokens.refresh']['types'],
  },
  'metas.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/meta',
    tokens: [{"old":"/api/v1/meta","type":0,"val":"api","end":""},{"old":"/api/v1/meta","type":0,"val":"v1","end":""},{"old":"/api/v1/meta","type":0,"val":"meta","end":""}],
    types: placeholder as Registry['metas.show']['types'],
  },
  'folders.folders.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/folders',
    tokens: [{"old":"/api/v1/folders","type":0,"val":"api","end":""},{"old":"/api/v1/folders","type":0,"val":"v1","end":""},{"old":"/api/v1/folders","type":0,"val":"folders","end":""}],
    types: placeholder as Registry['folders.folders.index']['types'],
  },
  'folders.folders.store': {
    methods: ["POST"],
    pattern: '/api/v1/folders',
    tokens: [{"old":"/api/v1/folders","type":0,"val":"api","end":""},{"old":"/api/v1/folders","type":0,"val":"v1","end":""},{"old":"/api/v1/folders","type":0,"val":"folders","end":""}],
    types: placeholder as Registry['folders.folders.store']['types'],
  },
  'folders.folders.reorder': {
    methods: ["PATCH"],
    pattern: '/api/v1/folders/reorder',
    tokens: [{"old":"/api/v1/folders/reorder","type":0,"val":"api","end":""},{"old":"/api/v1/folders/reorder","type":0,"val":"v1","end":""},{"old":"/api/v1/folders/reorder","type":0,"val":"folders","end":""},{"old":"/api/v1/folders/reorder","type":0,"val":"reorder","end":""}],
    types: placeholder as Registry['folders.folders.reorder']['types'],
  },
  'folders.folders.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/folders/:id',
    tokens: [{"old":"/api/v1/folders/:id","type":0,"val":"api","end":""},{"old":"/api/v1/folders/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/folders/:id","type":0,"val":"folders","end":""},{"old":"/api/v1/folders/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['folders.folders.update']['types'],
  },
  'folders.folders.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/folders/:id',
    tokens: [{"old":"/api/v1/folders/:id","type":0,"val":"api","end":""},{"old":"/api/v1/folders/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/folders/:id","type":0,"val":"folders","end":""},{"old":"/api/v1/folders/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['folders.folders.destroy']['types'],
  },
  'lists.lists.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists',
    tokens: [{"old":"/api/v1/lists","type":0,"val":"api","end":""},{"old":"/api/v1/lists","type":0,"val":"v1","end":""},{"old":"/api/v1/lists","type":0,"val":"lists","end":""}],
    types: placeholder as Registry['lists.lists.index']['types'],
  },
  'lists.lists.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists',
    tokens: [{"old":"/api/v1/lists","type":0,"val":"api","end":""},{"old":"/api/v1/lists","type":0,"val":"v1","end":""},{"old":"/api/v1/lists","type":0,"val":"lists","end":""}],
    types: placeholder as Registry['lists.lists.store']['types'],
  },
  'lists.lists.reorder': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/reorder',
    tokens: [{"old":"/api/v1/lists/reorder","type":0,"val":"api","end":""},{"old":"/api/v1/lists/reorder","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/reorder","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/reorder","type":0,"val":"reorder","end":""}],
    types: placeholder as Registry['lists.lists.reorder']['types'],
  },
  'lists.lists.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:id',
    tokens: [{"old":"/api/v1/lists/:id","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:id","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['lists.lists.show']['types'],
  },
  'lists.lists.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:id',
    tokens: [{"old":"/api/v1/lists/:id","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:id","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['lists.lists.update']['types'],
  },
  'lists.lists.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:id',
    tokens: [{"old":"/api/v1/lists/:id","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:id","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['lists.lists.destroy']['types'],
  },
  'lists.categories.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/categories',
    tokens: [{"old":"/api/v1/lists/:listId/categories","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/categories","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/categories","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['lists.categories.index']['types'],
  },
  'lists.categories.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/categories',
    tokens: [{"old":"/api/v1/lists/:listId/categories","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/categories","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/categories","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['lists.categories.store']['types'],
  },
  'lists.categories.import': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/categories/import',
    tokens: [{"old":"/api/v1/lists/:listId/categories/import","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/categories/import","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/categories/import","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/categories/import","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/categories/import","type":0,"val":"categories","end":""},{"old":"/api/v1/lists/:listId/categories/import","type":0,"val":"import","end":""}],
    types: placeholder as Registry['lists.categories.import']['types'],
  },
  'lists.categories.reorder': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:listId/categories/reorder',
    tokens: [{"old":"/api/v1/lists/:listId/categories/reorder","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/categories/reorder","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/categories/reorder","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/categories/reorder","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/categories/reorder","type":0,"val":"categories","end":""},{"old":"/api/v1/lists/:listId/categories/reorder","type":0,"val":"reorder","end":""}],
    types: placeholder as Registry['lists.categories.reorder']['types'],
  },
  'lists.categories.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:listId/categories/:categoryId',
    tokens: [{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"categories","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":1,"val":"categoryId","end":""}],
    types: placeholder as Registry['lists.categories.update']['types'],
  },
  'lists.categories.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/categories/:categoryId',
    tokens: [{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":0,"val":"categories","end":""},{"old":"/api/v1/lists/:listId/categories/:categoryId","type":1,"val":"categoryId","end":""}],
    types: placeholder as Registry['lists.categories.destroy']['types'],
  },
  'lists.items.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/items',
    tokens: [{"old":"/api/v1/lists/:listId/items","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items","type":0,"val":"items","end":""}],
    types: placeholder as Registry['lists.items.index']['types'],
  },
  'lists.items.recent': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/items/recent',
    tokens: [{"old":"/api/v1/lists/:listId/items/recent","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/recent","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/recent","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/recent","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/recent","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/recent","type":0,"val":"recent","end":""}],
    types: placeholder as Registry['lists.items.recent']['types'],
  },
  'lists.items.recent_names': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/items/recent-names',
    tokens: [{"old":"/api/v1/lists/:listId/items/recent-names","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/recent-names","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/recent-names","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/recent-names","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/recent-names","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/recent-names","type":0,"val":"recent-names","end":""}],
    types: placeholder as Registry['lists.items.recent_names']['types'],
  },
  'lists.items.categorize': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/items/categorize',
    tokens: [{"old":"/api/v1/lists/:listId/items/categorize","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/categorize","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/categorize","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/categorize","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/categorize","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/categorize","type":0,"val":"categorize","end":""}],
    types: placeholder as Registry['lists.items.categorize']['types'],
  },
  'lists.items.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/items',
    tokens: [{"old":"/api/v1/lists/:listId/items","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items","type":0,"val":"items","end":""}],
    types: placeholder as Registry['lists.items.store']['types'],
  },
  'lists.items.import': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/items/import',
    tokens: [{"old":"/api/v1/lists/:listId/items/import","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/import","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/import","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/import","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/import","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/import","type":0,"val":"import","end":""}],
    types: placeholder as Registry['lists.items.import']['types'],
  },
  'lists.items.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:listId/items/:itemId',
    tokens: [{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":1,"val":"itemId","end":""}],
    types: placeholder as Registry['lists.items.update']['types'],
  },
  'lists.items.move': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:listId/items/:itemId/move',
    tokens: [{"old":"/api/v1/lists/:listId/items/:itemId/move","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/move","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/move","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/move","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/move","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/move","type":1,"val":"itemId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/move","type":0,"val":"move","end":""}],
    types: placeholder as Registry['lists.items.move']['types'],
  },
  'lists.items.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/items/:itemId',
    tokens: [{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/:itemId","type":1,"val":"itemId","end":""}],
    types: placeholder as Registry['lists.items.destroy']['types'],
  },
  'lists.items.restore': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/items/:itemId/restore',
    tokens: [{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":1,"val":"itemId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/restore","type":0,"val":"restore","end":""}],
    types: placeholder as Registry['lists.items.restore']['types'],
  },
  'lists.items.purge': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/items/:itemId/purge',
    tokens: [{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":0,"val":"items","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":1,"val":"itemId","end":""},{"old":"/api/v1/lists/:listId/items/:itemId/purge","type":0,"val":"purge","end":""}],
    types: placeholder as Registry['lists.items.purge']['types'],
  },
  'lists.stores.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/stores',
    tokens: [{"old":"/api/v1/lists/:listId/stores","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/stores","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/stores","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/stores","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/stores","type":0,"val":"stores","end":""}],
    types: placeholder as Registry['lists.stores.index']['types'],
  },
  'lists.stores.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/stores',
    tokens: [{"old":"/api/v1/lists/:listId/stores","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/stores","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/stores","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/stores","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/stores","type":0,"val":"stores","end":""}],
    types: placeholder as Registry['lists.stores.store']['types'],
  },
  'lists.stores.detach': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/stores/:storeId',
    tokens: [{"old":"/api/v1/lists/:listId/stores/:storeId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/stores/:storeId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/stores/:storeId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/stores/:storeId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/stores/:storeId","type":0,"val":"stores","end":""},{"old":"/api/v1/lists/:listId/stores/:storeId","type":1,"val":"storeId","end":""}],
    types: placeholder as Registry['lists.stores.detach']['types'],
  },
  'lists.favorite_items.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/favorites',
    tokens: [{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/favorites","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"favorites","end":""}],
    types: placeholder as Registry['lists.favorite_items.index']['types'],
  },
  'lists.favorite_items.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/favorites',
    tokens: [{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/favorites","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/favorites","type":0,"val":"favorites","end":""}],
    types: placeholder as Registry['lists.favorite_items.store']['types'],
  },
  'lists.favorite_items.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:listId/favorites/:id',
    tokens: [{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"favorites","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['lists.favorite_items.update']['types'],
  },
  'lists.favorite_items.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/favorites/:id',
    tokens: [{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":0,"val":"favorites","end":""},{"old":"/api/v1/lists/:listId/favorites/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['lists.favorite_items.destroy']['types'],
  },
  'lists.favorite_items.add_to_list': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/favorites/:id/add-to-list',
    tokens: [{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":0,"val":"favorites","end":""},{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":1,"val":"id","end":""},{"old":"/api/v1/lists/:listId/favorites/:id/add-to-list","type":0,"val":"add-to-list","end":""}],
    types: placeholder as Registry['lists.favorite_items.add_to_list']['types'],
  },
  'lists.list_members.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/members',
    tokens: [{"old":"/api/v1/lists/:listId/members","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/members","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/members","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/members","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/members","type":0,"val":"members","end":""}],
    types: placeholder as Registry['lists.list_members.index']['types'],
  },
  'lists.list_members.candidates': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/members/candidates',
    tokens: [{"old":"/api/v1/lists/:listId/members/candidates","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/members/candidates","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/members/candidates","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/members/candidates","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/members/candidates","type":0,"val":"members","end":""},{"old":"/api/v1/lists/:listId/members/candidates","type":0,"val":"candidates","end":""}],
    types: placeholder as Registry['lists.list_members.candidates']['types'],
  },
  'lists.list_members.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/members',
    tokens: [{"old":"/api/v1/lists/:listId/members","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/members","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/members","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/members","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/members","type":0,"val":"members","end":""}],
    types: placeholder as Registry['lists.list_members.store']['types'],
  },
  'lists.list_members.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/lists/:listId/members/:memberId',
    tokens: [{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"members","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":1,"val":"memberId","end":""}],
    types: placeholder as Registry['lists.list_members.update']['types'],
  },
  'lists.list_members.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/members/:memberId',
    tokens: [{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":0,"val":"members","end":""},{"old":"/api/v1/lists/:listId/members/:memberId","type":1,"val":"memberId","end":""}],
    types: placeholder as Registry['lists.list_members.destroy']['types'],
  },
  'lists.list_export.email': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/export/email',
    tokens: [{"old":"/api/v1/lists/:listId/export/email","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/export/email","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/export/email","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/export/email","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/export/email","type":0,"val":"export","end":""},{"old":"/api/v1/lists/:listId/export/email","type":0,"val":"email","end":""}],
    types: placeholder as Registry['lists.list_export.email']['types'],
  },
  'lists.list_invites.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/lists/:listId/invites',
    tokens: [{"old":"/api/v1/lists/:listId/invites","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/invites","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/invites","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/invites","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/invites","type":0,"val":"invites","end":""}],
    types: placeholder as Registry['lists.list_invites.index']['types'],
  },
  'lists.list_invites.store': {
    methods: ["POST"],
    pattern: '/api/v1/lists/:listId/invites',
    tokens: [{"old":"/api/v1/lists/:listId/invites","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/invites","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/invites","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/invites","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/invites","type":0,"val":"invites","end":""}],
    types: placeholder as Registry['lists.list_invites.store']['types'],
  },
  'lists.list_invites.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/lists/:listId/invites/:inviteId',
    tokens: [{"old":"/api/v1/lists/:listId/invites/:inviteId","type":0,"val":"api","end":""},{"old":"/api/v1/lists/:listId/invites/:inviteId","type":0,"val":"v1","end":""},{"old":"/api/v1/lists/:listId/invites/:inviteId","type":0,"val":"lists","end":""},{"old":"/api/v1/lists/:listId/invites/:inviteId","type":1,"val":"listId","end":""},{"old":"/api/v1/lists/:listId/invites/:inviteId","type":0,"val":"invites","end":""},{"old":"/api/v1/lists/:listId/invites/:inviteId","type":1,"val":"inviteId","end":""}],
    types: placeholder as Registry['lists.list_invites.destroy']['types'],
  },
  'tokens.personal_access_tokens.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/tokens',
    tokens: [{"old":"/api/v1/tokens","type":0,"val":"api","end":""},{"old":"/api/v1/tokens","type":0,"val":"v1","end":""},{"old":"/api/v1/tokens","type":0,"val":"tokens","end":""}],
    types: placeholder as Registry['tokens.personal_access_tokens.index']['types'],
  },
  'tokens.personal_access_tokens.store': {
    methods: ["POST"],
    pattern: '/api/v1/tokens',
    tokens: [{"old":"/api/v1/tokens","type":0,"val":"api","end":""},{"old":"/api/v1/tokens","type":0,"val":"v1","end":""},{"old":"/api/v1/tokens","type":0,"val":"tokens","end":""}],
    types: placeholder as Registry['tokens.personal_access_tokens.store']['types'],
  },
  'tokens.personal_access_tokens.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/tokens/:tokenId',
    tokens: [{"old":"/api/v1/tokens/:tokenId","type":0,"val":"api","end":""},{"old":"/api/v1/tokens/:tokenId","type":0,"val":"v1","end":""},{"old":"/api/v1/tokens/:tokenId","type":0,"val":"tokens","end":""},{"old":"/api/v1/tokens/:tokenId","type":1,"val":"tokenId","end":""}],
    types: placeholder as Registry['tokens.personal_access_tokens.update']['types'],
  },
  'tokens.personal_access_tokens.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/tokens/:tokenId',
    tokens: [{"old":"/api/v1/tokens/:tokenId","type":0,"val":"api","end":""},{"old":"/api/v1/tokens/:tokenId","type":0,"val":"v1","end":""},{"old":"/api/v1/tokens/:tokenId","type":0,"val":"tokens","end":""},{"old":"/api/v1/tokens/:tokenId","type":1,"val":"tokenId","end":""}],
    types: placeholder as Registry['tokens.personal_access_tokens.destroy']['types'],
  },
  'personal_access_tokens.me': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/tokens/me',
    tokens: [{"old":"/api/v1/tokens/me","type":0,"val":"api","end":""},{"old":"/api/v1/tokens/me","type":0,"val":"v1","end":""},{"old":"/api/v1/tokens/me","type":0,"val":"tokens","end":""},{"old":"/api/v1/tokens/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['personal_access_tokens.me']['types'],
  },
  'invite_accept.preview': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/invites/:token',
    tokens: [{"old":"/api/v1/invites/:token","type":0,"val":"api","end":""},{"old":"/api/v1/invites/:token","type":0,"val":"v1","end":""},{"old":"/api/v1/invites/:token","type":0,"val":"invites","end":""},{"old":"/api/v1/invites/:token","type":1,"val":"token","end":""}],
    types: placeholder as Registry['invite_accept.preview']['types'],
  },
  'invite_accept.accept': {
    methods: ["POST"],
    pattern: '/api/v1/invites/:token/accept',
    tokens: [{"old":"/api/v1/invites/:token/accept","type":0,"val":"api","end":""},{"old":"/api/v1/invites/:token/accept","type":0,"val":"v1","end":""},{"old":"/api/v1/invites/:token/accept","type":0,"val":"invites","end":""},{"old":"/api/v1/invites/:token/accept","type":1,"val":"token","end":""},{"old":"/api/v1/invites/:token/accept","type":0,"val":"accept","end":""}],
    types: placeholder as Registry['invite_accept.accept']['types'],
  },
  'stores.stores.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/stores/:id',
    tokens: [{"old":"/api/v1/stores/:id","type":0,"val":"api","end":""},{"old":"/api/v1/stores/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/stores/:id","type":0,"val":"stores","end":""},{"old":"/api/v1/stores/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['stores.stores.update']['types'],
  },
  'stores.stores.categories': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/stores/:id/categories',
    tokens: [{"old":"/api/v1/stores/:id/categories","type":0,"val":"api","end":""},{"old":"/api/v1/stores/:id/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/stores/:id/categories","type":0,"val":"stores","end":""},{"old":"/api/v1/stores/:id/categories","type":1,"val":"id","end":""},{"old":"/api/v1/stores/:id/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['stores.stores.categories']['types'],
  },
  'stores.stores.reorder_categories': {
    methods: ["PATCH"],
    pattern: '/api/v1/stores/:id/categories',
    tokens: [{"old":"/api/v1/stores/:id/categories","type":0,"val":"api","end":""},{"old":"/api/v1/stores/:id/categories","type":0,"val":"v1","end":""},{"old":"/api/v1/stores/:id/categories","type":0,"val":"stores","end":""},{"old":"/api/v1/stores/:id/categories","type":1,"val":"id","end":""},{"old":"/api/v1/stores/:id/categories","type":0,"val":"categories","end":""}],
    types: placeholder as Registry['stores.stores.reorder_categories']['types'],
  },
  'backupSettings.backup_settings.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/backup-settings',
    tokens: [{"old":"/api/v1/backup-settings","type":0,"val":"api","end":""},{"old":"/api/v1/backup-settings","type":0,"val":"v1","end":""},{"old":"/api/v1/backup-settings","type":0,"val":"backup-settings","end":""}],
    types: placeholder as Registry['backupSettings.backup_settings.show']['types'],
  },
  'backupSettings.backup_settings.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/backup-settings',
    tokens: [{"old":"/api/v1/backup-settings","type":0,"val":"api","end":""},{"old":"/api/v1/backup-settings","type":0,"val":"v1","end":""},{"old":"/api/v1/backup-settings","type":0,"val":"backup-settings","end":""}],
    types: placeholder as Registry['backupSettings.backup_settings.update']['types'],
  },
  'backupSettings.backup_settings.run': {
    methods: ["POST"],
    pattern: '/api/v1/backup-settings/run',
    tokens: [{"old":"/api/v1/backup-settings/run","type":0,"val":"api","end":""},{"old":"/api/v1/backup-settings/run","type":0,"val":"v1","end":""},{"old":"/api/v1/backup-settings/run","type":0,"val":"backup-settings","end":""},{"old":"/api/v1/backup-settings/run","type":0,"val":"run","end":""}],
    types: placeholder as Registry['backupSettings.backup_settings.run']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
