import { ApiClient } from '../client.js'
import {
  BASE_URL_ENV,
  maskToken,
  normalizeBaseUrl,
  readConfig,
  resolveBaseUrl,
  resolveToken,
  writeConfig
} from '../config.js'
import { requireClient, type CommandContext } from '../context.js'
import { boolFlag, rejectUnknownFlags, stringFlag } from '../args.js'
import { formatJson } from '../output.js'
import { UsageError } from '../errors.js'
import type { AccessTokenDto } from '@everylist/shared'

/**
 * `everylist login` — saves the server URL and token, then verifies them with a real request so
 * a bad token fails here rather than on the next command. With no `--token` (and no env token),
 * prompts for one without echoing it.
 */
export async function loginCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags, ['url', 'token'])
  const config = readConfig(ctx.env)

  // Precedence for the saved URL: `--url` flag, then `EVERYLIST_URL`, then the existing config.
  const url = stringFlag(ctx.flags, 'url') ?? resolveBaseUrl(config, ctx.env)
  if (!url) {
    throw new UsageError(
      `Missing --url. Run \`everylist login --url https://your-server\`, or set ${BASE_URL_ENV}.`
    )
  }
  const normalizedUrl = normalizeBaseUrl(url)

  let token = stringFlag(ctx.flags, 'token') ?? resolveToken(config, ctx.env)
  if (!token) {
    token = (await ctx.prompt('Personal Access Token: ')).trim()
    if (!token) throw new UsageError('No token provided.')
  }

  // Verify before persisting: a token that can't authenticate shouldn't be written to disk.
  const client = new ApiClient(normalizedUrl, token, fetch, 30_000, ctx.env)
  const identity = await client.get<AccessTokenDto>('/api/v1/tokens/me')

  // Persist the *literal* URL the user gave (normalized), not the env override, so a one-off
  // login can't silently rewrite a different server into the config file.
  writeConfig({ baseUrl: normalizedUrl, token }, ctx.env)

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson({ baseUrl: normalizedUrl, token: maskToken(token), identity })}\n`)
    return
  }

  const listCount = identity.grants.length
  ctx.output.out(`Connected to ${normalizedUrl}\n`)
  ctx.output.out(`Token: ${identity.name ?? '(unnamed)'} (${maskToken(token)})\n`)
  ctx.output.out(
    `Reachable lists: ${listCount} ${listCount === 1 ? 'list' : 'lists'}` +
      (listCount > 0 ? ` — ${identity.grants.map((g) => `list ${g.listId}`).join(', ')}` : '') +
      '\n'
  )
}

/**
 * `everylist token` — show the current configuration and verify it against the server, without
 * changing anything. `--json` for scripts. Never prints the full token.
 */
export async function tokenCommand(ctx: CommandContext): Promise<void> {
  rejectUnknownFlags(ctx.flags)
  const client = requireClient(ctx)
  // Report the credentials the client actually uses (flag > env > config), not a fresh
  // config/env lookup — otherwise a `--url`/`--token` override would verify against one server
  // but display another.
  const baseUrl = ctx.baseUrl!
  const token = ctx.token

  const identity = await client.get<AccessTokenDto>('/api/v1/tokens/me')

  if (boolFlag(ctx.flags, 'json')) {
    ctx.output.out(`${formatJson({ baseUrl, token: token ? maskToken(token) : null, identity })}\n`)
    return
  }

  ctx.output.out(`Server: ${baseUrl}\n`)
  ctx.output.out(
    `Token:  ${identity.name ?? '(unnamed)'}${token ? ` (${maskToken(token)})` : ''}\n`
  )
  ctx.output.out(
    `Grants: ${identity.grants.map((g) => `list ${g.listId} (${g.role})`).join(', ') || 'none'}\n`
  )
}
