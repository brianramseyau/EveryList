import type { ItemDto } from '@everylist/shared'
import { boolFlag, rejectUnknownFlags, stringFlag } from '../args.js'
import { requireClient, type CommandContext } from '../context.js'
import { formatJson, formatTable } from '../output.js'
import {
  fetchAccessToken,
  fetchLists,
  grantedLists,
  requirePositional,
  resolveList
} from '../resolve.js'

/** A single match: which list it came from, plus the item itself. */
interface SearchResult {
  list: string
  item: ItemDto
}

/**
 * `everylist search <query>` — case-insensitive substring search across every list the token can
 * reach, or one list with `--list`. Outputs every match (not just the first), so a name on two
 * lists isn't silently reduced to one.
 */
export async function searchCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags, ['list'])
  const client = requireClient(ctx)
  const query = requirePositional(ctx.positionals, 0, '<query>')

  const [lists, token] = await Promise.all([fetchLists(client), fetchAccessToken(client)])
  let visible = grantedLists(lists, token)
  const listFilter = stringFlag(ctx.flags, 'list')
  if (listFilter !== undefined) visible = [resolveList(visible, listFilter)]

  const normalized = query.trim().toLowerCase()
  const results: SearchResult[] = []
  for (const list of visible) {
    const items = await client.get<ItemDto[]>(`/api/v1/lists/${list.id}/items`)
    for (const item of items) {
      if (item.name.toLowerCase().includes(normalized)) {
        results.push({ list: list.name, item })
      }
    }
  }

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson(results.map((r) => ({ list: r.list, ...r.item })))}\n`)
    return
  }

  if (results.length === 0) {
    ctx.output.out(`No items matching "${query}".\n`)
    return
  }

  const rows = results.map((r) => [
    r.list,
    String(r.item.id),
    r.item.name,
    r.item.checked ? 'checked' : 'open'
  ])
  ctx.output.out(`${formatTable(rows, ['LIST', 'ID', 'ITEM', 'STATE'])}\n`)
}
