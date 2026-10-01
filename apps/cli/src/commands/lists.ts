import { boolFlag, rejectUnknownFlags } from '../args.js'
import { requireClient, type CommandContext } from '../context.js'
import { formatJson, formatTable } from '../output.js'
import { fetchAccessToken, fetchLists, grantedLists } from '../resolve.js'

/**
 * `everylist lists` — the lists this token can reach, with their ids, roles, and open-item
 * counts. The starting point for every other command's `<list>` argument.
 */
export async function listsCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags)
  const client = requireClient(ctx)

  const [lists, token] = await Promise.all([fetchLists(client), fetchAccessToken(client)])
  const visible = grantedLists(lists, token)

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson(visible)}\n`)
    return
  }

  if (visible.length === 0) {
    ctx.output.out('This token has no granted lists.\n')
    return
  }

  const rows = visible.map((list) => [
    String(list.id),
    list.name,
    list.role,
    String(list.itemCount)
  ])
  ctx.output.out(`${formatTable(rows, ['ID', 'NAME', 'ROLE', 'OPEN'])}\n`)
}
