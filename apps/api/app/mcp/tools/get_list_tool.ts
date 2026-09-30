import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'

import { Tool } from '@jrmc/adonis-mcp'
import vine from '@vinejs/vine'
import Item from '#models/item'
import { getEffectiveCategories } from '#services/category_service'
import { itemProjection, requireGrantedList, withListAccess } from '#services/mcp/access'

/**
 * `get_list` — every active item on one granted list (open items, display order), plus the
 * list's effective categories so ids in the output are interpretable. The main read tool:
 * same shape/ordering the app's own list view leads with.
 */
const vineSchema = vine.object({
  list: vine.string().trim().minLength(1).meta({ description: 'List id or exact list name' }),
  includeChecked: vine
    .boolean()
    .optional()
    .meta({ description: 'Include checked-off items (default: false = open items only)' }),
})

type Schema = BaseSchema<{
  list: { type: 'string' }
  includeChecked: { type: 'boolean' }
}>

export default class GetListTool extends Tool<Schema> {
  name = 'get_list'
  title = 'Read a list'
  description =
    "Read one list's items in display order — name, checked state, quantity, price, notes, " +
    'deadline, category/store ids and sub-tasks, with the list’s categories. Open items only ' +
    'unless includeChecked is true.'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    const user = auth?.user
    if (!user) return response.error('Authentication required.')
    const payload = (args ?? {}) as { list?: string; includeChecked?: boolean }
    if (!payload.list) return response.error('List is required.')

    const outcome = await withListAccess(async () => {
      const list = await requireGrantedList(user, payload.list!)
      const [items, categories] = await Promise.all([
        Item.query()
          .where('listId', list.id)
          .whereNull('deletedAt')
          .if(payload.includeChecked !== true, (query) => query.where('checked', false))
          .orderBy('sortOrder', 'asc')
          .preload('subItems', (subItemsQuery) => subItemsQuery.orderBy('sortOrder', 'asc')),
        getEffectiveCategories(list),
      ])
      return { list, categories, items }
    })

    if (!outcome.ok) return response.error(outcome.error)

    const { list, categories, items } = outcome.value
    return response.structured({
      list: { id: list.id, name: list.name },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
      })),
      items: items.map(itemProjection),
    })
  }

  schema() {
    return vine.create(vineSchema).toJSONSchema() as Schema
  }
}
