import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import { DateTime } from 'luxon'
import {
  McpToolError,
  itemProjection,
  requireGrantedList,
  withListAccess,
} from '#services/mcp/access'
import { broadcastSync } from '#services/sync_broadcaster'

/**
 * `remove_item` — soft-deletes an item (the swipe-delete path: `deletedAt` stamped, checked
 * state cleared, row kept for the Recently Deleted page's restore and for add-by-name reuse).
 * No purge tool on purpose: hard deletion is a deliberate UI action against the Recently
 * Deleted page, not something a model should do on a name's say-so.
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  itemId: vine.number().positive().meta({ description: 'Item id (from get_list or search_items)' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
}>

export default class RemoveItemTool extends Tool<Schema> {
  name = 'remove_item'
  title = 'Remove an item'
  description =
    'Remove an item from its list (soft delete — restorable, and re-adding the same name ' +
    'later restores it automatically with its details intact).'

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

      // Identical to items_controller.destroy's mutation (version 818-826): a deleted row is
      // reused later as a fresh open item, so it must not look checked off.
      item.deletedAt = DateTime.now()
      item.checked = false
      item.checkedAt = null
      item.version += 1
      await item.save()

      await broadcastSync({
        listId: list.id,
        entityType: 'item',
        entityId: item.id,
        op: 'delete',
        version: item.version,
      })

      return { item, list }
    })

    if (!outcome.ok) return response.error(outcome.error)
    const { item, list } = outcome.value
    return response.structured({
      list: { id: list.id, name: list.name },
      removed: itemProjection(item),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
