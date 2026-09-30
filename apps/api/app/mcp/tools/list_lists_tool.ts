import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import { grantedLists } from '#services/mcp/access'

/**
 * `list_lists` — every list the calling PAT is granted, with its open-item count. The
 * always-start-here tool: an MCP client has no session state, so every session begins by
 * discovering which lists this token can reach (the external-client equivalent of
 * `GET /api/v1/tokens/me` + `GET /api/v1/lists`). Read counts, not totals: "what actually
 * needs doing" is the signal the web list index leads with too.
 */
const vineSchema = vine.object({
  includeArchived: vine
    .boolean()
    .optional()
    .meta({ description: 'Include archived lists (default: only active lists)' }),
})

type Schema = BaseSchema<{
  includeArchived: { type: 'boolean' }
}>

export default class ListListsTool extends Tool<Schema> {
  name = 'list_lists'
  title = 'List lists'
  description =
    'List the EveryList lists this access token can reach. Use the returned ids (or exact ' +
    'names) with the other tools.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    const token = user?.currentAccessToken
    if (!user || !token) return response.error('Authentication required.')

    const includeArchived = (args as { includeArchived?: boolean } | undefined)?.includeArchived

    const accessible = await grantedLists(token)
    const lists = accessible.filter((list) => includeArchived === true || !list.archived)

    // One grouped count query for all lists rather than one per list — an MCP client calling
    // this first on every session shouldn't cost N round trips. `listId` must be selected
    // explicitly or it never lands on the returned row (the group key isn't projected by
    // `count()` alone), which silently yielded 0 open items for every list.
    const counts = new Map<number, number>()
    if (lists.length > 0) {
      const rows = await Item.query()
        .select('listId')
        .whereIn(
          'listId',
          lists.map((list) => list.id)
        )
        .whereNull('deletedAt')
        .where('checked', false)
        .count('id as total')
        .groupBy('listId')
      for (const row of rows) counts.set(row.listId, Number(row.$extras.total))
    }

    return response.structured({
      lists: lists.map((list) => ({
        id: list.id,
        name: list.name,
        archived: Boolean(list.archived),
        openItems: counts.get(list.id) ?? 0,
      })),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
