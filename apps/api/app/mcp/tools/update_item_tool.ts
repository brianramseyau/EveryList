import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import { broadcastSync } from '#services/sync_broadcaster'
import {
  McpToolError,
  itemProjection,
  requireGrantedList,
  withListAccess,
} from '#services/mcp/access'

/**
 * `update_item` — changes an item's editable fields (name/quantity/notes/category/store/
 * price/deadline). Mirrors `items_controller.update`'s plain-field `merge(rest)` path: no
 * checked-state changes (complete_item/uncomplete_item own that transition), no recurrence
 * rule editing (an MCP-managed series edit would need the controller's full rule validation —
 * a later tool, not a shortcut here), no reordering (that's the HTTP move endpoint's
 * fractional-indexing job).
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  itemId: vine.number().positive().meta({ description: 'Item id (from get_list or search_items)' }),
  name: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(200)
    .optional()
    .meta({ description: 'New name' }),
  quantity: vine
    .string()
    .trim()
    .maxLength(50)
    .nullable()
    .optional()
    .meta({ description: 'Quantity text; null clears it' }),
  notes: vine
    .string()
    .trim()
    .maxLength(1000)
    .nullable()
    .optional()
    .meta({ description: 'Notes; null clears them' }),
  categoryId: vine
    .number()
    .positive()
    .nullable()
    .optional()
    .meta({ description: 'Category id; null clears it' }),
  storeId: vine
    .number()
    .positive()
    .nullable()
    .optional()
    .meta({ description: 'Store id; null clears it' }),
  price: vine.number().min(0).nullable().optional().meta({ description: 'Price; null clears it' }),
  deadline: vine
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)
    .nullable()
    .optional()
    .meta({ description: 'Deadline YYYY-MM-DD or YYYY-MM-DDTHH:mm; null clears it' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
  name: { type: 'string' }
  quantity: { 'type': 'string'; 'x-nullable': true }
  notes: { 'type': 'string'; 'x-nullable': true }
  categoryId: { 'type': 'number'; 'x-nullable': true }
  storeId: { 'type': 'number'; 'x-nullable': true }
  price: { 'type': 'number'; 'x-nullable': true }
  deadline: { 'type': 'string'; 'x-nullable': true }
}>

export default class UpdateItemTool extends Tool<Schema> {
  name = 'update_item'
  title = 'Update an item'
  description =
    'Change an item’s name, quantity, notes, price, deadline, category or store. Fields not ' +
    'passed are left alone; pass null to clear one. Checked-state changes belong to ' +
    'complete_item/uncomplete_item.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as Record<string, unknown>
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

      // Exactly the fields the schema allows, already trimmed/validated by VineJS — merged the
      // way items_controller.update does for its `rest` (unknown/absent fields untouched).
      const updates: Partial<
        Pick<Item, 'name' | 'quantity' | 'notes' | 'categoryId' | 'storeId' | 'price' | 'deadline'>
      > = {}
      for (const field of [
        'name',
        'quantity',
        'notes',
        'categoryId',
        'storeId',
        'price',
        'deadline',
      ] as const) {
        if (payload[field] !== undefined) {
          // `item.merge` rejects unknown keys; these keys are all real columns, so the cast is
          // the validator's guarantee, not a leap of faith.
          ;(updates as Record<string, unknown>)[field] = payload[field]
        }
      }
      if (Object.keys(updates).length === 0) {
        throw new McpToolError('Nothing to update — pass at least one field.')
      }

      item.merge(updates)
      item.version += 1
      await item.save()

      await broadcastSync({
        listId: list.id,
        entityType: 'item',
        entityId: item.id,
        op: 'update',
        version: item.version,
      })

      return { item, list }
    })

    if (!outcome.ok) return response.error(outcome.error)
    const { item, list } = outcome.value
    return response.structured({
      list: { id: list.id, name: list.name },
      item: itemProjection(item),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
