import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import Item from '#models/item'
import { broadcastSync } from '#services/sync_broadcaster'
import {
  McpToolError,
  itemProjection,
  requireGrantedList,
  withListAccess,
} from '#services/mcp/access'
import {
  assertScopedRefs,
  updateItemArgsValidator,
  validateToolArgs,
  type UpdateItemArgs,
} from '#validators/mcp'

/**
 * `update_item` — changes an item's editable fields (name/quantity/notes/category/store/
 * price/deadline). Mirrors `items_controller.update`'s plain-field `merge(rest)` path: no
 * checked-state changes (complete_item/uncomplete_item own that transition), no recurrence
 * rule editing (an MCP-managed series edit would need the controller's full rule validation —
 * a later tool, not a shortcut here), no reordering (that's the HTTP move endpoint's
 * fractional-indexing job).
 *
 * The args validator (`#validators/mcp`) is the single source of truth: `schema()` derives the
 * advertised JSON Schema from it and `handle` runs the same validator at call time. This
 * `Schema` only satisfies `Tool`'s generic (the package's `JSONSchema` can't express nullable
 * unions, so the runtime types come from `UpdateItemArgs` below).
 */
type Schema = BaseSchema<{
  list: { type: 'string' }
  itemId: { type: 'number' }
  name: { type: 'string' }
  quantity: { type: 'string' }
  notes: { type: 'string' }
  categoryId: { type: 'number' }
  storeId: { type: 'number' }
  price: { type: 'number' }
  deadline: { type: 'string' }
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
    const preliminary = (args ?? {}) as Record<string, unknown>
    if (!preliminary.list || typeof preliminary.itemId !== 'number') {
      return response.error('List and itemId are required.')
    }

    const outcome = await withListAccess(async () => {
      const fields = await validateToolArgs<UpdateItemArgs>(updateItemArgsValidator, args)
      const list = await requireGrantedList(user, fields.list, 'editor')
      const item = await Item.query()
        .where('id', fields.itemId)
        .where('listId', list.id)
        .whereNull('deletedAt')
        .first()
      if (!item) throw new McpToolError('Item not found on this list.')
      await assertScopedRefs(list, fields)

      // Build the merge from the *validated* fields explicitly — no computed-key assignment into
      // a shared object, so there's nothing for a `__proto__`-style key to pollute.
      const updates: Partial<
        Pick<Item, 'name' | 'quantity' | 'notes' | 'categoryId' | 'storeId' | 'price' | 'deadline'>
      > = {}
      if (fields.name !== undefined) updates.name = fields.name
      if (fields.quantity !== undefined) updates.quantity = fields.quantity
      if (fields.notes !== undefined) updates.notes = fields.notes
      if (fields.categoryId !== undefined) updates.categoryId = fields.categoryId
      if (fields.storeId !== undefined) updates.storeId = fields.storeId
      if (fields.price !== undefined) updates.price = fields.price
      if (fields.deadline !== undefined) updates.deadline = fields.deadline

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
    return updateItemArgsValidator.toJSONSchema() as unknown as Schema
  }
}
