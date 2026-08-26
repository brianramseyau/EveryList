import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'event_stream': { paramsTuple?: []; params?: {} }
    'subscribe': { paramsTuple?: []; params?: {} }
    'unsubscribe': { paramsTuple?: []; params?: {} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'auth.password_reset.forgot': { paramsTuple?: []; params?: {} }
    'auth.password_reset.reset': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.profile.update': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'debug.show': { paramsTuple?: []; params?: {} }
    'folders.folders.index': { paramsTuple?: []; params?: {} }
    'folders.folders.store': { paramsTuple?: []; params?: {} }
    'folders.folders.reorder': { paramsTuple?: []; params?: {} }
    'folders.folders.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'folders.folders.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.store': { paramsTuple?: []; params?: {} }
    'lists.lists.reorder': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.bulk_import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
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
    'lists.items.move': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.move_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.restore': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.purge': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.category_learnings.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'storeId': ParamValue} }
    'lists.favorite_items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.favorite_items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.favorite_items.add_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.candidates': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'lists.list_members.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'lists.list_export.email': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'inviteId': ParamValue} }
    'tokens.personal_access_tokens.index': { paramsTuple?: []; params?: {} }
    'tokens.personal_access_tokens.store': { paramsTuple?: []; params?: {} }
    'tokens.personal_access_tokens.update': { paramsTuple: [ParamValue]; params: {'tokenId': ParamValue} }
    'tokens.personal_access_tokens.destroy': { paramsTuple: [ParamValue]; params: {'tokenId': ParamValue} }
    'personal_access_tokens.me': { paramsTuple?: []; params?: {} }
    'alexa.alexa': { paramsTuple?: []; params?: {} }
    'alexa.alexa_oauth.token': { paramsTuple?: []; params?: {} }
    'alexa.alexa_icons.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'invite_accept.preview': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'invite_accept.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'stores.stores.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reorder_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reset_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'backupSettings.backup_settings.show': { paramsTuple?: []; params?: {} }
    'backupSettings.backup_settings.update': { paramsTuple?: []; params?: {} }
    'backupSettings.backup_settings.run': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'event_stream': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'debug.show': { paramsTuple?: []; params?: {} }
    'folders.folders.index': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent_names': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.categorize': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.category_learnings.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.candidates': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'tokens.personal_access_tokens.index': { paramsTuple?: []; params?: {} }
    'personal_access_tokens.me': { paramsTuple?: []; params?: {} }
    'alexa.alexa_icons.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'invite_accept.preview': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'backupSettings.backup_settings.show': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'event_stream': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'metas.show': { paramsTuple?: []; params?: {} }
    'debug.show': { paramsTuple?: []; params?: {} }
    'folders.folders.index': { paramsTuple?: []; params?: {} }
    'lists.lists.index': { paramsTuple?: []; params?: {} }
    'lists.lists.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.recent_names': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.categorize': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.category_learnings.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.stores.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_members.candidates': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.index': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'tokens.personal_access_tokens.index': { paramsTuple?: []; params?: {} }
    'personal_access_tokens.me': { paramsTuple?: []; params?: {} }
    'alexa.alexa_icons.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'invite_accept.preview': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'stores.stores.categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'backupSettings.backup_settings.show': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'subscribe': { paramsTuple?: []; params?: {} }
    'unsubscribe': { paramsTuple?: []; params?: {} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'auth.password_reset.forgot': { paramsTuple?: []; params?: {} }
    'auth.password_reset.reset': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.refresh': { paramsTuple?: []; params?: {} }
    'folders.folders.store': { paramsTuple?: []; params?: {} }
    'lists.lists.store': { paramsTuple?: []; params?: {} }
    'lists.categories.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.bulk_import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.import': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.items.move_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.restore': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.favorite_items.add_to_list': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_export.email': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.list_invites.store': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'tokens.personal_access_tokens.store': { paramsTuple?: []; params?: {} }
    'alexa.alexa': { paramsTuple?: []; params?: {} }
    'alexa.alexa_oauth.token': { paramsTuple?: []; params?: {} }
    'invite_accept.accept': { paramsTuple: [ParamValue]; params: {'token': ParamValue} }
    'backupSettings.backup_settings.run': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'profile.profile.update': { paramsTuple?: []; params?: {} }
    'folders.folders.reorder': { paramsTuple?: []; params?: {} }
    'folders.folders.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.reorder': { paramsTuple?: []; params?: {} }
    'lists.lists.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.reorder': { paramsTuple: [ParamValue]; params: {'listId': ParamValue} }
    'lists.categories.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.move': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.favorite_items.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.update': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'tokens.personal_access_tokens.update': { paramsTuple: [ParamValue]; params: {'tokenId': ParamValue} }
    'stores.stores.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stores.stores.reorder_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'backupSettings.backup_settings.update': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'folders.folders.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.lists.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'lists.categories.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'categoryId': ParamValue} }
    'lists.items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.items.purge': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'itemId': ParamValue} }
    'lists.stores.detach': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'storeId': ParamValue} }
    'lists.favorite_items.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'id': ParamValue} }
    'lists.list_members.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'memberId': ParamValue} }
    'lists.list_invites.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'listId': ParamValue,'inviteId': ParamValue} }
    'tokens.personal_access_tokens.destroy': { paramsTuple: [ParamValue]; params: {'tokenId': ParamValue} }
    'stores.stores.reset_categories': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}