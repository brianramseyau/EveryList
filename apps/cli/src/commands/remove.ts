import type { ItemDto } from '@everylist/shared'
import { boolFlag, rejectUnknownFlags } from '../args.js'
import { requireClient, type CommandContext } from '../context.js'
import { formatJson } from '../output.js'
import { requirePositional, resolveItem } from '../resolve.js'
import { resolveListArg } from './common.js'

/**
 * `everylist remove <list> <item>` — soft-deletes an item (recoverable from the app's
 * recently-deleted view). `<item>` is an id or a name; a name prefers the open row.
 */
export async function removeCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags)
  const client = requireClient(ctx)
  const listArg = requirePositional(ctx.positionals, 0, '<list>')
  const itemArg = requirePositional(ctx.positionals, 1, '<item>')

  const list = await resolveListArg(client, listArg)
  const items = await client.get<ItemDto[]>(`/api/v1/lists/${list.id}/items`)
  const item = resolveItem(items, itemArg)

  await client.delete(`/api/v1/lists/${list.id}/items/${item.id}`)

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson({ removed: item.id, name: item.name })}\n`)
    return
  }
  ctx.output.out(`Removed "${item.name}" from ${list.name}.\n`)
}
