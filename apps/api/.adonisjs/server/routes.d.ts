import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.store': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.reorder': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.categories.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.restore': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'storeId': ParamValue} }
    'stores.stores.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reorder_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'favorites.favorite_items.index': { paramsTuple?: []; params?: {} }
    'favorites.favorite_items.store': { paramsTuple?: []; params?: {} }
    'favorites.favorite_items.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'favorites.favorite_items.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'favorites.favorite_items.add_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'listId': ParamValue} }
  }
  POST: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'lists.lists.store': { paramsTuple?: []; params?: {} }
    'lists.categories.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.restore': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'favorites.favorite_items.store': { paramsTuple?: []; params?: {} }
    'favorites.favorite_items.add_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'listId': ParamValue} }
  }
  GET: {
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'favorites.favorite_items.index': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'favorites.favorite_items.index': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'lists.lists.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.reorder': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'stores.stores.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reorder_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'favorites.favorite_items.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'lists.lists.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'storeId': ParamValue} }
    'favorites.favorite_items.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}