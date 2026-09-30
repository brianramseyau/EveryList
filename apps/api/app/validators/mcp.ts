import vine, { errors } from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import type List from '#models/list'
import Category from '#models/category'
import { McpToolError } from '#services/mcp/access'

/**
 * VineJS validators for MCP tool arguments (foundational/PLAN_32_PHASE_MCP_SERVER.md), shared as
 * the single source of truth for both runtime validation and each tool's advertised JSON Schema
 * (`schema()` returns `validator.toJSONSchema()`), so the two can't drift.
 *
 * These deliberately do NOT reuse `#validators/item`'s HTTP validators: those model a raw item
 * body and carry `checked`/`sortOrder`/`expectedVersion`/`recurrence`, which MCP owns through
 * dedicated tools (checkoff) or excludes entirely.
 *
 * Runtime validation matters because the MCP package only uses `schema()` to advertise
 * `inputSchema` — it never validates a call itself — so without this a loosely-typed argument
 * (e.g. a string price) would reach the database.
 */

export const addItemArgsValidator = vine.create({
  list: vine
    .string()
    .trim()
    .minLength(1)
    .meta({ description: 'List id or exact list name to add into' }),
  name: vine.string().trim().minLength(1).maxLength(200).meta({ description: 'Item name' }),
  quantity: vine.string().trim().maxLength(50).nullable().optional().meta({
    description: 'Quantity text, e.g. "2" or "500 g" (ignored when the name already exists)',
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
    .meta({ description: 'Price as a number (ignored when the name already exists)' }),
})

export const updateItemArgsValidator = vine.create({
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

export type AddItemArgs = Infer<typeof addItemArgsValidator.schema>
export type UpdateItemArgs = Infer<typeof updateItemArgsValidator.schema>

/**
 * Runs a tool-arg validator and maps a VineJS failure to an `McpToolError`, so an invalid call
 * surfaces to the model as a normal tool-error row with readable messages rather than a raw
 * exception.
 */
export async function validateToolArgs<T>(
  validator: { validate: (data: unknown) => Promise<T> },
  data: unknown
): Promise<T> {
  try {
    return await validator.validate(data)
  } catch (error) {
    if (error instanceof errors.E_VALIDATION_ERROR) {
      throw new McpToolError(
        error.messages.map((message: { message: string }) => message.message).join('; ')
      )
    }
    throw error
  }
}

/**
 * A supplied (non-null) `categoryId` must belong to `list`, and a supplied `storeId` must be
 * attached to it — the DB only enforces that the referenced row exists, never that it's this
 * list's. `null` (clear) and `undefined` (leave alone) pass straight through.
 */
export async function assertScopedRefs(
  list: List,
  fields: { categoryId?: number | null; storeId?: number | null }
): Promise<void> {
  if (typeof fields.categoryId === 'number') {
    const category = await Category.query()
      .where('id', fields.categoryId)
      .where('listId', list.id)
      .first()
    if (!category) throw new McpToolError('Category not found on this list.')
  }
  if (typeof fields.storeId === 'number') {
    const store = await list.related('stores').query().where('stores.id', fields.storeId).first()
    if (!store) throw new McpToolError('Store is not attached to this list.')
  }
}
