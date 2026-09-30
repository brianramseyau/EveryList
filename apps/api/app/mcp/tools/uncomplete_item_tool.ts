import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import {
  McpToolError,
  itemProjection,
  requireGrantedList,
  withListAccess,
} from '#services/mcp/access'
import { setItemChecked } from '#services/mcp/checkoff'

/**
 * `uncomplete_item` — reopens a checked item (the checkbox's reverse transition: limited like
 * every intake path, and an undo-discard when the row just spawned the series' only open copy).
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  itemId: vine.number().positive().meta({ description: 'Item id (from get_list or search_items)' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
}>

export default class UncompleteItemTool extends Tool<Schema> {
  name = 'uncomplete_item'
  title = 'Reopen an item'
  description =
    'Mark a checked item as not done (uncheck). On a full list this may be refused until ' +
    'capacity frees up; on a repeating item it undoes the last completion.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as { list?: string; itemId?: number }
    if (!payload.list || typeof payload.itemId !== 'number') {
      return response.error('List and itemId are required.')
    }

    const outcome = await withListAccess(async () => {
      const list = await requireGrantedList(user, payload.list!, 'editor')
      const item = await Item.query()
        .where('id', payload.itemId!)
        .where('listId', list.id)
        .whereNull('deletedAt')
        .first()
      if (!item) throw new McpToolError('Item not found on this list.')
      const result = await setItemChecked(list, item, false)
      if ('refused' in result) throw new McpToolError(result.refused)
      return { result, list }
    })

    if (!outcome.ok) return response.error(outcome.error)
    const { result, list } = outcome.value
    return response.structured({
      list: { id: list.id, name: list.name },
      item: itemProjection(result.item),
      // Unchecking only ever *discards* a just-spawned copy — it never creates one, so no
      // `spawned` field here (that's complete_item's outcome).
      undone: result.discarded ? itemProjection(result.discarded) : undefined,
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
