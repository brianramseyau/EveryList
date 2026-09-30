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
import { findItemByName, nextSortOrder, restoreItemRow } from '#services/item_reuse'
import {
  hasCapacityFor,
  limitReachedMessage,
  limitReachedMessageForUncheck,
} from '#services/unchecked_limit'
import { suggestCategoryId } from '#services/category_suggestion_service'
import { broadcastSync } from '#services/sync_broadcaster'

/**
 * `add_item` — the add-by-name path, mirroring `items_controller.store`'s get-or-create
 * semantics exactly: an active same-name row is returned (unchecking it if it was checked,
 * capacity-gated like the checkbox), a soft-deleted one is *restored* with its category/
 * store/price/notes intact (AGENTS.md's re-adding-a-deleted-item footgun — never a fresh
 * metadata-less duplicate), and only a genuinely new name creates a row, gated by the list's
 * unchecked-item limit. Every add-by-name path must resolve through `findItemByName`; this
 * tool is the MCP half of that contract.
 */
const vineSchema = vine.object({
  list: vine
    .string()
    .trim()
    .minLength(1)
    .meta({ description: 'List id or exact list name to add into' }),
  name: vine.string().trim().minLength(1).maxLength(200).meta({ description: 'Item name' }),
  quantity: vine.string().trim().maxLength(50).nullable().optional().meta({
    description: 'Quantity text, e.g. "2", "500 g" (ignored when the name already exists)',
  }),
  notes: vine
    .string()
    .trim()
    .maxLength(1000)
    .nullable()
    .optional()
    .meta({ description: 'Notes shown under the item (ignored when the name already exists)' }),
  categoryId: vine
    .number()
    .positive()
    .nullable()
    .optional()
    .meta({ description: 'Category id — omit to use this list’s learned auto-categorization' }),
  storeId: vine
    .number()
    .positive()
    .nullable()
    .optional()
    .meta({ description: 'Store id to slot the item into (ignored when the name already exists)' }),
  price: vine
    .number()
    .min(0)
    .nullable()
    .optional()
    .meta({ description: 'Price text as a number (ignored when the name already exists)' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  name: { type: 'string' }
  quantity: { 'type': 'string'; 'x-nullable': true }
  notes: { 'type': 'string'; 'x-nullable': true }
  categoryId: { 'type': 'number'; 'x-nullable': true }
  storeId: { 'type': 'number'; 'x-nullable': true }
  price: { 'type': 'number'; 'x-nullable': true }
}>

export default class AddItemTool extends Tool<Schema> {
  name = 'add_item'
  title = 'Add an item'
  description =
    "Add an item to a list (editor-granted lists only). Re-adding an existing name doesn't " +
    'duplicate it: an open row with that name is returned as-is (and re-checked-off rows are ' +
    'reopened), a previously deleted row is restored with its old details. Omit categoryId to ' +
    'use the list’s learned categories.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as {
      list?: string
      name?: string
      quantity?: string | null
      notes?: string | null
      categoryId?: number | null
      storeId?: number | null
      price?: number | null
    }
    if (!payload.list || !payload.name) {
      return response.error('List and name are required.')
    }

    const outcome = await withListAccess(async () => {
      // 'editor': every write tool funnels through here — a viewer-granted list is refused
      // before any lookup happens (no probing).
      const list = await requireGrantedList(user, payload.list!, 'editor')
      const name = payload.name!

      const normalized = name.trim()
      const match = await findItemByName(list, normalized)
      const existing = match && !match.deleted ? match.item : null

      // Get-or-create on the existing row: unchecking a checked one first (limit-gated, the
      // same "make a checked row open again" transition the checkbox and the HTTP path use).
      if (existing) {
        if (!existing.checked) return { item: existing, list, action: 'already-open' as const }
        if (!(await hasCapacityFor(list))) {
          throw new McpToolError(limitReachedMessageForUncheck(list))
        }
        existing.checked = false
        existing.checkedAt = null
        existing.version += 1
        await existing.save()
        await broadcastSync({
          listId: list.id,
          entityType: 'item',
          entityId: existing.id,
          op: 'update',
          version: existing.version,
        })
        return { item: existing, list, action: 'reopened' as const }
      }

      // Restore path — the row comes back with its metadata; intake, so the limit gates it.
      const deletedMatch = match?.deleted ? match.item : null
      if (deletedMatch) {
        if (!(await hasCapacityFor(list))) {
          throw new McpToolError(limitReachedMessage(list))
        }
        await restoreItemRow(list, deletedMatch, { respectInsertPosition: true })
        return { item: deletedMatch, list, action: 'restored' as const }
      }

      // Fresh create — same field defaults the HTTP store path uses, same capacity gate
      // checked as late as possible.
      if (!(await hasCapacityFor(list))) {
        throw new McpToolError(limitReachedMessage(list))
      }
      const item = await Item.create({
        listId: list.id,
        name: normalized,
        quantity: payload.quantity ?? null,
        notes: payload.notes ?? null,
        categoryId:
          payload.categoryId !== undefined
            ? payload.categoryId
            : await suggestCategoryId(list, normalized),
        storeId: payload.storeId ?? null,
        price: payload.price ?? null,
        checked: false,
        sortOrder: await nextSortOrder(list, { respectInsertPosition: true }),
        createdBy: user.id,
        version: 1,
      })

      await broadcastSync({
        listId: list.id,
        entityType: 'item',
        entityId: item.id,
        op: 'create',
        version: item.version,
      })
      return { item, list, action: 'created' as const }
    })

    if (!outcome.ok) return response.error(outcome.error)
    const { action, list, item } = outcome.value
    return response.structured({
      action,
      list: { id: list.id, name: list.name },
      item: itemProjection(item),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
