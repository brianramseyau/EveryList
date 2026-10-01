import type { ApiClient } from '../client.js'
import { fetchAccessToken, fetchLists, grantedLists, resolveList } from '../resolve.js'
import type { GrantedList } from '../resolve.js'

/**
 * Fetches the account's lists, filters them to the token's grants, and resolves a list argument
 * (id or name) against that view. Every list-scoped command starts this way, so this is the one
 * place the "grants, not raw memberships" rule is applied.
 */
export async function resolveListArg(client: ApiClient, listArg: string): Promise<GrantedList> {
  const [lists, token] = await Promise.all([fetchLists(client), fetchAccessToken(client)])
  return resolveList(grantedLists(lists, token), listArg)
}

/** The minimal item shape these commands need to resolve and act on a row. */
export interface ItemSummary {
  id: number
  name: string
  checked: boolean
  quantity?: string | null
  categoryId?: number | null
}

/** One list's items (checked included, so an explicit id/name can still be resolved for uncheck). */
export function fetchItems(client: ApiClient, listId: number): Promise<ItemSummary[]> {
  return client.get<ItemSummary[]>(`/api/v1/lists/${listId}/items`)
}
