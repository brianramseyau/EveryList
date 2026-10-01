import type { ApiClient } from './client.js'
import type { FlagValue } from './args.js'
import { BASE_URL_ENV, TOKEN_ENV } from './config.js'
import { AuthError } from './errors.js'
import type { Output } from './output.js'

/**
 * Everything a command needs to run, injected rather than reached for globally so every command
 * is exercised in tests with a fake client, fake output, and fake prompt — no real network or
 * TTY. `client` is only populated once credentials resolve; commands that don't need the API
 * (e.g. help) can run with it absent.
 */
export interface CommandContext {
  /** The parsed command name, or undefined when none was supplied. */
  command?: string
  positionals: string[]
  flags: Record<string, FlagValue>
  output: Output
  /** The HTTP client, built from the resolved base URL + token. May be undefined when
   *  credentials are missing — commands that need it call `requireClient`. */
  client?: ApiClient
  /** The effective base URL (flag > env > config), when one is configured. Kept alongside
   *  `client` so `token` reports exactly the server it verified against. */
  baseUrl?: string
  /** The effective token (flag > env > config), when one is configured. */
  token?: string
  /** Prompts for a line of input (used only by `login` when no `--token`/env is supplied).
   *  Defaults to reading stdin. */
  prompt(question: string): Promise<string>
  /** The process env, injected for config resolution in tests. */
  env: NodeJS.ProcessEnv
}

/**
 * The client to use, or a clean error naming what's missing. Kept here (rather than in each
 * command) so the "not logged in" guidance has exactly one wording.
 */
export function requireClient(ctx: CommandContext): ApiClient {
  if (!ctx.client) {
    throw new AuthError(
      `Not connected to a server. Run \`everylist login --url <server>\`, or set ${BASE_URL_ENV} ` +
        `and ${TOKEN_ENV}.`
    )
  }
  return ctx.client
}
