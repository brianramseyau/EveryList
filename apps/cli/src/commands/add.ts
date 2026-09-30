import { boolFlag, rejectUnknownFlags, stringFlag } from '../args.js'
import { requireClient, type CommandContext } from '../context.js'
import { formatJson } from '../output.js'
import { parsePriceFlag } from '../parse.js'
import { requirePositional, resolveItem } from '../resolve.js'
import type { ItemDto } from '@everylist/shared'
import { resolveListArg } from './common.js'

/**
 * `everylist add <list> <item>` — adds an item, with optional `--quantity`, `--notes`,
 * `--price`, `--deadline`. Mirrors the API's get-or-create: a name already on the list re-opens
 * that row instead of creating a duplicate, so re-adding an item preserves its previous
 * quantity/price/notes/category.
 */
export async function addCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags, ['quantity', 'notes', 'price', 'deadline'])
  const client = requireClient(ctx)
  const listArg = requirePositional(ctx.positionals, 0, '<list>')
  const name = requirePositional(ctx.positionals, 1, '<item>')

  const list = await resolveListArg(client, listArg)

  const body: Record<string, unknown> = { name }
  const quantity = stringFlag(ctx.flags, 'quantity')
  if (quantity !== undefined) body.quantity = quantity
  const notes = stringFlag(ctx.flags, 'notes')
  if (notes !== undefined) body.notes = notes
  const deadline = stringFlag(ctx.flags, 'deadline')
  if (deadline !== undefined) body.deadline = deadline
  const price = stringFlag(ctx.flags, 'price')
  if (price !== undefined) body.price = parsePriceFlag(price)

  const item = await client.post<{ id: number; name: string }>(
    `/api/v1/lists/${list.id}/items`,
    body
  )

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson(item)}\n`)
    return
  }
  ctx.output.out(`Added "${item.name}" to ${list.name} (item id ${item.id}).\n`)
}

/**
 * `everylist complete <list> <item>` / `everylist uncheck <list> <item>` — toggles an item's
 * checked state. `<item>` is an id or a name; a name prefers the open row (so `complete Milk`
 * doesn't re-check an already-checked history row).
 */
export async function checkoffCommand(ctx: CommandContext, checked: boolean): Promise<void> {
  rejectUnknownFlags(ctx.flags)
  const client = requireClient(ctx)
  const listArg = requirePositional(ctx.positionals, 0, '<list>')
  const itemArg = requirePositional(ctx.positionals, 1, '<item>')

  const list = await resolveListArg(client, listArg)
  const items = await client.get<ItemDto[]>(`/api/v1/lists/${list.id}/items`)
  const item = resolveItem(items, itemArg)

  const updated = await client.patch<Record<string, unknown>>(
    `/api/v1/lists/${list.id}/items/${item.id}`,
    { checked }
  )

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson(updated)}\n`)
    return
  }
  ctx.output.out(`${checked ? 'Checked off' : 'Reopened'} "${item.name}" on ${list.name}.\n`)
}
