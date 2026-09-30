import type { ResourceContext } from '@jrmc/adonis-mcp/types/context'
import { Resource } from '@jrmc/adonis-mcp'
import Item from '#models/item'
import { getEffectiveCategories } from '#services/category_service'
import { itemProjection, requireGrantedList, withListAccess } from '#services/mcp/access'

/**
 * `everylist://lists/{listId}` resource (foundational/PLAN_32_PHASE_MCP_SERVER.md) — the same
 * payload `get_list` returns, for MCP clients that read resources instead of calling tools.
 * Resource reads run behind the same `pat` guard as tool calls (route-level, before the
 * package resolves the URI), and the transport binds the request's `auth` into the context,
 * so access control is identical to every other surface.
 */
export default class ListItemsResource extends Resource {
  name = 'list_items'
  uri = 'everylist://lists/{listId}'
  mimeType = 'application/json'
  title = 'EveryList list contents'
  description =
    'The open items of one list this token is granted, in display order, with the list’s categories.'

  async handle({ args, response, auth }: ResourceContext<{ listId: string }>) {
    const listId = args?.listId
    const user = auth?.user
    // Template URIs only ever match with a listId (the package sets ctx.args from the URI) and
    // the route's `pat` guard guarantees a user, so this is a defensive no-match guard.
    /* c8 ignore next 2 -- unreachable through the package's own URI-template dispatch. */
    if (!listId || !user) return response.text('List id and authentication required.')

    // Reuses the tools' own access wrapper so the denial wording (and its test coverage) lives
    // in exactly one place.
    const outcome = await withListAccess(async () => {
      const list = await requireGrantedList(user, listId)
      const [items, categories] = await Promise.all([
        Item.query()
          .where('listId', list.id)
          .whereNull('deletedAt')
          .where('checked', false)
          .orderBy('sortOrder', 'asc')
          .preload('subItems', (subItemsQuery) => subItemsQuery.orderBy('sortOrder', 'asc')),
        getEffectiveCategories(list),
      ])
      return { list, items, categories }
    })

    if (!outcome.ok) return response.text(outcome.error)

    const { list, items, categories } = outcome.value
    return response.text(
      JSON.stringify({
        list: { id: list.id, name: list.name },
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
        items: items.map(itemProjection),
      })
    )
  }
}
