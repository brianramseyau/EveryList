import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import SubItem from '#models/sub_item'
import db from '@adonisjs/lucid/services/db'
import { itemProjection, requireGrantedList, withListAccess } from '#services/mcp/access'
import { broadcastSync } from '#services/sync_broadcaster'
import { McpToolError } from '#services/mcp/access'

/**
 * `add_subtask` — appends a sub-task to an item's checklist, mirroring
 * `sub_items_controller.store`: only on lists with the feature on, only onto an *open* parent
 * (a checked parent has no open sub-tasks by definition and must be re-opened first), created
 * inside the same transaction that re-verifies the parent's state so a concurrent check-off
 * can't slip an open sub-task underneath it.
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  itemId: vine
    .number()
    .positive()
    .meta({ description: 'Parent item id (from get_list or search_items)' }),
  name: vine.string().trim().minLength(1).maxLength(200).meta({ description: 'Sub-task text' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
  name: { type: 'string' }
}>

export default class AddSubtaskTool extends Tool<Schema> {
  name = 'add_subtask'
  title = 'Add a sub-task'
  description =
    'Add a sub-task (checklist step) to an item. Only on lists with sub-tasks enabled, and ' +
    'only while the parent item is still open.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as { list?: string; itemId?: number; name?: string }
    if (!payload.list || typeof payload.itemId !== 'number' || !payload.name) {
      return response.error('List, itemId and name are required.')
    }

    const outcome = await withListAccess(async () => {
      const list = await requireGrantedList(user, payload.list as string, 'editor')
      if (!list.useSubtasks) {
        throw new McpToolError('Sub-tasks are turned off for this list.')
      }
      const item = await Item.query()
        .where('id', payload.itemId as number)
        .where('listId', list.id)
        .whereNull('deletedAt')
        .first()
      if (!item) throw new McpToolError('Item not found on this list.')

      const subItem = await db.transaction(async (trx) => {
        const freshItem = await Item.query({ client: trx })
          .where('id', item.id)
          .whereNull('deletedAt')
          .firstOrFail()
        if (freshItem.checked) return null
        return SubItem.create(
          {
            itemId: item.id,
            name: payload.name as string,
            checked: false,
            sortOrder: await nextSubItemSortOrder(item.id),
            createdBy: user.id,
            version: 1,
          },
          { client: trx }
        )
      })
      if (!subItem) {
        throw new McpToolError('Uncheck this item before adding a sub-task.')
      }

      await broadcastSync({
        listId: list.id,
        entityType: 'sub_item',
        entityId: subItem.id,
        op: 'create',
        version: subItem.version,
        payload: { itemId: item.id },
      })

      return { item: subItem, list, parent: item }
    })

    if (!outcome.ok) return response.error(outcome.error)
    const { item, list, parent } = outcome.value
    return response.structured({
      list: { id: list.id, name: list.name },
      parentItem: itemProjection(parent),
      subTask: { id: item.id, name: item.name, checked: item.checked, version: item.version },
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}

/** Appends to the end of the parent's checklist — same helper sub_items_controller uses. */
async function nextSubItemSortOrder(itemId: number): Promise<number> {
  const result = await SubItem.query()
    .where('itemId', itemId)
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}
