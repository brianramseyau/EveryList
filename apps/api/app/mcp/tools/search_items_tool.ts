import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import type List from '#models/list'
import {
  grantedLists,
  itemProjection,
  requireGrantedList,
  withListAccess,
} from '#services/mcp/access'
import { closestMatch } from '#services/alexa/fuzzy_match'

/**
 * `search_items` — find items by name on one list, or across every list the token can reach.
 * Matches case-insensitive substrings (so "coffee" finds "Ground coffee beans", and a name on
 * several lists returns every row), falling back to a single closest fuzzy match when no
 * substring matches; matches carry the owning list so the caller can aim a write tool.
 */
const vineSchema = vine.object({
  query: vine.string().trim().minLength(1).meta({ description: 'Item name to search for' }),
  list: vine.string().trim().minLength(1).optional().meta({
    description: 'Restrict the search to one list (id or exact name); omit for all lists',
  }),
  checked: vine
    .boolean()
    .optional()
    .meta({ description: 'Filter by checked state; omit to include both open and checked' }),
})

type Schema = BaseSchema<{
  query: { type: 'string' }
  list: { type: 'string' }
  checked: { type: 'boolean' }
}>

export default class SearchItemsTool extends Tool<Schema> {
  name = 'search_items'
  title = 'Search items'
  description =
    'Find items by name on one list, or across every list this token can reach. Each match ' +
    'carries its list name/id so you can pass it to a write tool.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user || !user.currentAccessToken) return response.error('Authentication required.')

    const payload = (args ?? {}) as {
      query?: string
      list?: string
      checked?: boolean
    }
    if (!payload.query) return response.error('Query is required.')

    // One list (through the standard gate), or every granted list at once.
    const targets: List[] | { error: string } = payload.list
      ? await (async () => {
          const outcome = await withListAccess(() => requireGrantedList(user, payload.list!))
          return outcome.ok ? [outcome.value] : outcome
        })()
      : await grantedLists(user)

    if (!Array.isArray(targets)) return response.error(targets.error)

    const active = (checked: boolean) =>
      Item.query()
        .whereIn(
          'listId',
          targets.map((list) => list.id)
        )
        .whereNull('deletedAt')
        .where('checked', checked)

    // Include open rows unless the caller asked for checked-only; include checked rows unless
    // the caller asked for open-only. (The two ternaries must be independent — the previous
    // chained form returned nothing at all for `checked: true`.)
    const open = payload.checked === true ? [] : await active(false).orderBy('sortOrder', 'asc')
    const checked = payload.checked === false ? [] : await active(true).orderBy('sortOrder', 'asc')

    // Case-insensitive substring matches first (so "coffee" finds "Ground coffee beans" and a
    // name on two lists returns both rows); if none, fall back to the single closest fuzzy
    // match, which tolerates near-miss phrasing. Every hit keeps its own list context (the
    // candidates were all drawn from `targets`, so the join always resolves).
    const normalized = payload.query.trim().toLowerCase()
    const candidates = [...open, ...checked]
    const substringMatches = candidates.filter((item) =>
      item.name.trim().toLowerCase().includes(normalized)
    )
    const matches =
      substringMatches.length > 0
        ? substringMatches
        : (() => {
            const fuzzy = closestMatch(payload.query, candidates, (item) => item.name)
            return fuzzy ? [fuzzy] : []
          })()

    const listNameById = new Map(targets.map((list) => [list.id, list.name]))
    return response.structured({
      query: payload.query,
      matches: matches.map((item) => ({
        ...itemProjection(item),
        listId: item.listId,
        listName: listNameById.get(item.listId),
      })),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
