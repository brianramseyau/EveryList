import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import { itemProjection, requireGrantedList, withListAccess } from '#services/mcp/access'

/**
 * `get_item` — one item's full row (or one sub-task of it) by id on a granted list. For
 * follow-ups a model needs a detail read for: exact notes, recursion/sub-task state, version
 * (for concurrency-aware clients).
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  itemId: vine.number().positive().meta({ description: 'Item id (from get_list or search_items)' }),
  subTaskId: vine
    .number()
    .positive()
    .optional()
    .meta({ description: 'Return just this sub-task instead of the parent item' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
  subTaskId: { type: 'number' }
}>

export default class GetItemTool extends Tool<Schema> {
  name = 'get_item'
  title = 'Read an item'
  description =
    "Read one item's full details (including its sub-tasks) — or one specific sub-task with " +
    'subTaskId. Use after get_list/search_items name the item you care about.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as { list?: string; itemId?: number; subTaskId?: number }
    if (!payload.list || typeof payload.itemId !== 'number') {
      return response.error('List and itemId are required.')
    }

    const outcome = await withListAccess(async () => {
      const list = await requireGrantedList(user, payload.list!)
      const item = await Item.query()
        .where('id', payload.itemId!)
        .where('listId', list.id)
        .whereNull('deletedAt')
        .preload('subItems', (subItemsQuery) => subItemsQuery.orderBy('sortOrder', 'asc'))
        .first()

      if (!item) return null

      if (typeof payload.subTaskId === 'number') {
        const subTask = item.subItems.find((sub) => sub.id === payload.subTaskId)
        return subTask
          ? { found: true as const, kind: 'sub' as const, sub: subTask, item }
          : { found: false as const }
      }
      return { found: true as const, kind: 'item' as const, item }
    })

    if (!outcome.ok) return response.error(outcome.error)
    if (!outcome.value) return response.error('Item not found on this list.')
    if (!outcome.value.found) return response.error('Item not found on this list.')

    if (outcome.value.kind === 'sub') {
      const { sub, item } = outcome.value
      return response.structured({
        item: { id: item.id, name: item.name },
        subTask: { id: sub.id, name: sub.name, checked: sub.checked, version: sub.version },
      })
    }

    return response.structured({ item: itemProjection(outcome.value.item) })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
