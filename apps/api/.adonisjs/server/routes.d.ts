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
    'folders.folders.index': { paramsTuple?: []; params?: {} }
    'folders.folders.store': { paramsTuple?: []; params?: {} }
    'folders.folders.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'folders.folders.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'lists.items.recent_names': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.categorize': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.restore': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'storeId': ParamValue} }
    'lists.favorite_items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.favorite_items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.favorite_items.add_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'lists.list_members.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'lists.list_export.email': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'inviteId': ParamValue} }
    'invite_accept.preview': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'invite_accept.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'stores.stores.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reorder_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'folders.folders.store': { paramsTuple?: []; params?: {} }
    'lists.lists.store': { paramsTuple?: []; params?: {} }
    'lists.categories.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.restore': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.add_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_export.email': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'invite_accept.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
  }
  GET: {
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'folders.folders.index': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent_names': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.categorize': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'invite_accept.preview': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'folders.folders.index': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent_names': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.categorize': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'invite_accept.preview': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'folders.folders.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.reorder': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.favorite_items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'stores.stores.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reorder_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'folders.folders.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'storeId': ParamValue} }
    'lists.favorite_items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'lists.list_invites.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'inviteId': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}