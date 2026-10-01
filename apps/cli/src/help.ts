import type { CommandContext } from './context.js'
import { addCommand, checkoffCommand } from './commands/add.js'
import { listCommand, itemsCommand } from './commands/items.js'
import { listsCommand } from './commands/lists.js'
import { loginCommand, tokenCommand } from './commands/login.js'
import { removeCommand } from './commands/remove.js'
import { searchCommand } from './commands/search.js'

/** A command's handler plus its one-line summary for help output. */
export interface Command {
  summary: string
  handler: (ctx: CommandContext) => Promise<void>
}

/**
 * The command surface (PLAN_33): configure/test the token, then the most-used reads and writes.
 * The `complete`/`uncheck` pair share one handler; `help`/`version` are handled directly in
 * `run.ts` (they work without credentials) and so aren't listed here.
 */
export const commands: Record<string, Command> = {
  login: {
    summary: 'Save and verify the server URL and Personal Access Token.',
    handler: loginCommand
  },
  token: { summary: 'Show the configured token and its list grants.', handler: tokenCommand },
  lists: { summary: 'List the lists this token can reach.', handler: listsCommand },
  list: { summary: 'Show one list (id or name).', handler: listCommand },
  items: {
    summary: 'Show a list’s items (open only; --all includes checked).',
    handler: itemsCommand
  },
  add: { summary: 'Add an item, or re-open one that already exists.', handler: addCommand },
  complete: { summary: 'Check off an item.', handler: (ctx) => checkoffCommand(ctx, true) },
  uncheck: { summary: 'Re-open a checked item.', handler: (ctx) => checkoffCommand(ctx, false) },
  remove: { summary: 'Soft-delete an item (recoverable in the app).', handler: removeCommand },
  search: { summary: 'Search item names across lists (--list to narrow).', handler: searchCommand }
}

const GLOBAL_FLAGS = '  --json            Print raw JSON instead of formatted text'

/** The full help text, or a single command's summary when `topic` names one. */
export function helpText(topic?: string): string {
  if (topic && commands[topic]) {
    return `everylist ${topic} — ${commands[topic].summary}`
  }

  const lines = [
    'everylist — command-line client for an EveryList server',
    '',
    'Usage: everylist <command> [arguments] [options]',
    '',
    'Commands:'
  ]
  const width = Math.max(...Object.keys(commands).map((name) => name.length))
  for (const [name, command] of Object.entries(commands)) {
    lines.push(`  ${name.padEnd(width)}  ${command.summary}`)
  }
  lines.push(
    '',
    'Options:',
    GLOBAL_FLAGS,
    '  --url <server>    Override the server URL for this invocation',
    '  --token <token>   Override the token for this invocation (prefer logging in once)',
    '  -h, --help        Show help',
    '  -V, --version     Show the CLI version',
    '',
    'Environment: EVERYLIST_URL and EVERYLIST_TOKEN override the saved config.'
  )
  return lines.join('\n')
}
