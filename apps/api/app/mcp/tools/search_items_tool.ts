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
 * Matches fuzzily the way the spoken/Alexa paths do ("coffee" finds "Ground coffee beans") so
 * a model's phrasing doesn't need to be exact; matches are read-only projections carrying the
 * owning list, so the caller can aim a write tool at one.
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
      : await grantedLists(user.currentAccessToken)

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
    const open =
      payload.checked === true
        ? []
        : await active(false).orderBy('sortOrder', 'asc').preload('list')
    const checked =
      payload.checked === false
        ? []
        : await active(true).orderBy('sortOrder', 'asc').preload('list')

    // Fuzzy naming over the combined candidate set, then each hit keeps its own list context
    // (the candidates were all drawn from `targets`, so the join always resolves).
    const candidates = [...open, ...checked]
    const match = closestMatch(payload.query, candidates, (item) => item.name)
    if (!match) {
      return response.structured({ matches: [] })
    }
    const listNameById = new Map(targets.map((list) => [list.id, list.name]))
    return response.structured({
      query: payload.query,
      matches: [itemProjection(match)].map((projection) => ({
        ...projection,
        listId: match.listId,
        listName: listNameById.get(match.listId),
      })),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
