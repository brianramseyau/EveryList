import type { CategoryDto } from '@everylist/shared'
import { boolFlag, rejectUnknownFlags } from '../args.js'
import { requireClient, type CommandContext } from '../context.js'
import { formatJson, formatTable } from '../output.js'
import { requirePositional } from '../resolve.js'
import { resolveListArg, fetchItems } from './common.js'

/** `everylist list <list>` — one list's details. `<list>` is an id or a name. */
export async function listCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags)
  const client = requireClient(ctx)
  const listArg = requirePositional(ctx.positionals, 0, '<list>')

  const list = await resolveListArg(client, listArg)

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson(list)}\n`)
    return
  }

  ctx.output.out(`${list.name} (id ${list.id})\n`)
  ctx.output.out(`Role: ${list.role}\n`)
  ctx.output.out(`Open items: ${list.itemCount}\n`)
  if (list.ownerName) ctx.output.out(`Owner: ${list.ownerName}\n`)
}

/**
 * `everylist items <list>` — the list's items, one per line, with an id and a checkbox marker.
 * Open items only by default; `--all` includes checked ones.
 */
export async function itemsCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags, ['all'])
  const client = requireClient(ctx)
  const listArg = requirePositional(ctx.positionals, 0, '<list>')

  const list = await resolveListArg(client, listArg)
  const items = await fetchItems(client, list.id)
  const showAll = boolFlag(ctx.flags, 'all')
  const shown = showAll ? items : items.filter((item) => !item.checked)

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson(shown)}\n`)
    return
  }

  if (shown.length === 0) {
    ctx.output.out(`No ${showAll ? '' : 'open '}items on ${list.name}.\n`)
    return
  }

  // Category names live on a separate endpoint; join them so the table is readable.
  const categories = await client.get<CategoryDto[]>(`/api/v1/lists/${list.id}/categories`)
  const nameById = new Map(categories.map((category) => [category.id, category.name]))

  const rows = shown.map((item) => [
    item.checked ? '[x]' : '[ ]',
    String(item.id),
    item.name,
    item.quantity ?? '',
    item.categoryId != null ? (nameById.get(item.categoryId) ?? '') : ''
  ])
  ctx.output.out(`${formatTable(rows, ['', 'ID', 'ITEM', 'QTY', 'CATEGORY'])}\n`)
}
