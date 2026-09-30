import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
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
import {
  addItemArgsValidator,
  assertScopedRefs,
  validateToolArgs,
  type AddItemArgs,
} from '#validators/mcp'

/**
 * `add_item` — the add-by-name path, mirroring `items_controller.store`'s get-or-create
 * semantics exactly: an active same-name row is returned (unchecking it if it was checked,
 * capacity-gated like the checkbox), a soft-deleted one is *restored* with its category/
 * store/price/notes intact (AGENTS.md's re-adding-a-deleted-item footgun — never a fresh
 * metadata-less duplicate), and only a genuinely new name creates a row, gated by the list's
 * unchecked-item limit. Every add-by-name path must resolve through `findItemByName`; this
 * tool is the MCP half of that contract.
 *
 * The args validator (`#validators/mcp`) is the single source of truth: `schema()` derives the
 * advertised JSON Schema from it and `handle` runs the same validator at call time. This
 * `Schema` only satisfies `Tool`'s generic (the package's `JSONSchema` can't express nullable
 * unions, so the runtime types come from `AddItemArgs` below).
 */
type Schema = BaseSchema<{
  list: { type: 'string' }
  name: { type: 'string' }
  quantity: { type: 'string' }
  notes: { type: 'string' }
  categoryId: { type: 'number' }
  storeId: { type: 'number' }
  price: { type: 'number' }
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
    const preliminary = (args ?? {}) as { list?: string; name?: string }
    if (!preliminary.list || !preliminary.name) {
      return response.error('List and name are required.')
    }

    const outcome = await withListAccess(async () => {
      // Validate args at runtime (the schema only advertises `inputSchema`).
      const fields = await validateToolArgs<AddItemArgs>(addItemArgsValidator, args)
      // 'editor': every write tool funnels through here — a viewer-granted list is refused
      // before any lookup happens (no probing).
      const list = await requireGrantedList(user, fields.list, 'editor')
      // Any supplied category/store must belong to this list, not just exist somewhere.
      await assertScopedRefs(list, fields)
      const normalized = fields.name.trim()
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
        quantity: fields.quantity ?? null,
        notes: fields.notes ?? null,
        categoryId:
          fields.categoryId !== undefined
            ? fields.categoryId
            : await suggestCategoryId(list, normalized),
        storeId: fields.storeId ?? null,
        price: fields.price ?? null,
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
    return addItemArgsValidator.toJSONSchema() as unknown as Schema
  }
}
