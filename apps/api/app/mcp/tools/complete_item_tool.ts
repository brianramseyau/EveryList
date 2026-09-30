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
 * `complete_item` — marks an open item checked (same gates as the checkbox everywhere in the
 * app: no open sub-tasks on the parent; a recurring item spawns its next occurrence in the
 * same transaction). See `services/mcp/checkoff.ts` for the extracted, shared rules.
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  itemId: vine.number().positive().meta({ description: 'Item id (from get_list or search_items)' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
}>

export default class CompleteItemTool extends Tool<Schema> {
  name = 'complete_item'
  title = 'Complete an item'
  description =
    'Mark an item as done (checked). Repeating items spawn their next occurrence, like ' +
    'checking it off in the app. Requires editor access to the list.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as { list?: string; itemId?: number }
    if (!payload.list || typeof payload.itemId !== 'number') {
      return response.error('List and itemId are required.')
    }

    const outcome = await withListAccess(async () => {
      const list = await requireGrantedList(user, payload.list as string, 'editor')
      const item = await Item.query()
        .where('id', payload.itemId as number)
        .where('listId', list.id)
        .whereNull('deletedAt')
        .first()
      if (!item) throw new McpToolError('Item not found on this list.')
      const result = await setItemChecked(list, item, true)
      if ('refused' in result) throw new McpToolError(result.refused)
      return { result, list }
    })

    if (!outcome.ok) return response.error(outcome.error)
    const { result, list } = outcome.value
    return response.structured({
      list: { id: list.id, name: list.name },
      item: itemProjection(result.item),
      // Completion only ever *creates* the next occurrence — it never discards one, so no
      // `undone` field here (that's uncomplete_item's outcome).
      spawned: result.spawned ? itemProjection(result.spawned) : undefined,
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
