/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  eventStream: typeof routes['event_stream']
  subscribe: typeof routes['subscribe']
  unsubscribe: typeof routes['unsubscribe']
  auth: {
    newAccount: {
      store: typeof routes['auth.new_account.store']
    }
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
    }
    passwordReset: {
      forgot: typeof routes['auth.password_reset.forgot']
      reset: typeof routes['auth.password_reset.reset']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
      update: typeof routes['profile.profile.update']
    }
    accessTokens: {
      destroy: typeof routes['profile.access_tokens.destroy']
      refresh: typeof routes['profile.access_tokens.refresh']
    }
  }
  metas: {
    show: typeof routes['metas.show']
  }
  folders: {
    folders: {
      index: typeof routes['folders.folders.index']
      store: typeof routes['folders.folders.store']
      reorder: typeof routes['folders.folders.reorder']
      update: typeof routes['folders.folders.update']
      destroy: typeof routes['folders.folders.destroy']
    }
  }
  lists: {
    lists: {
      index: typeof routes['lists.lists.index']
      store: typeof routes['lists.lists.store']
      reorder: typeof routes['lists.lists.reorder']
      show: typeof routes['lists.lists.show']
      update: typeof routes['lists.lists.update']
      destroy: typeof routes['lists.lists.destroy']
    }
    categories: {
      index: typeof routes['lists.categories.index']
      store: typeof routes['lists.categories.store']
      import: typeof routes['lists.categories.import']
      reorder: typeof routes['lists.categories.reorder']
      update: typeof routes['lists.categories.update']
      destroy: typeof routes['lists.categories.destroy']
    }
    items: {
      index: typeof routes['lists.items.index']
      recent: typeof routes['lists.items.recent']
      recentNames: typeof routes['lists.items.recent_names']
      categorize: typeof routes['lists.items.categorize']
      store: typeof routes['lists.items.store']
      import: typeof routes['lists.items.import']
      update: typeof routes['lists.items.update']
      move: typeof routes['lists.items.move']
      destroy: typeof routes['lists.items.destroy']
      restore: typeof routes['lists.items.restore']
      purge: typeof routes['lists.items.purge']
    }
    stores: {
      index: typeof routes['lists.stores.index']
      store: typeof routes['lists.stores.store']
      detach: typeof routes['lists.stores.detach']
    }
    favoriteItems: {
      index: typeof routes['lists.favorite_items.index']
      store: typeof routes['lists.favorite_items.store']
      update: typeof routes['lists.favorite_items.update']
      destroy: typeof routes['lists.favorite_items.destroy']
      addToList: typeof routes['lists.favorite_items.add_to_list']
    }
    listMembers: {
      index: typeof routes['lists.list_members.index']
      candidates: typeof routes['lists.list_members.candidates']
      store: typeof routes['lists.list_members.store']
      update: typeof routes['lists.list_members.update']
      destroy: typeof routes['lists.list_members.destroy']
    }
    listExport: {
      email: typeof routes['lists.list_export.email']
    }
    listInvites: {
      index: typeof routes['lists.list_invites.index']
      store: typeof routes['lists.list_invites.store']
      destroy: typeof routes['lists.list_invites.destroy']
    }
  }
  tokens: {
    personalAccessTokens: {
      index: typeof routes['tokens.personal_access_tokens.index']
      store: typeof routes['tokens.personal_access_tokens.store']
      update: typeof routes['tokens.personal_access_tokens.update']
      destroy: typeof routes['tokens.personal_access_tokens.destroy']
    }
  }
  personalAccessTokens: {
    me: typeof routes['personal_access_tokens.me']
  }
  inviteAccept: {
    preview: typeof routes['invite_accept.preview']
    accept: typeof routes['invite_accept.accept']
  }
  stores: {
    stores: {
      update: typeof routes['stores.stores.update']
      categories: typeof routes['stores.stores.categories']
      reorderCategories: typeof routes['stores.stores.reorder_categories']
    }
  }
}
