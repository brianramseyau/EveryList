import type { AccessTokenDto, ItemDto, ListDto, ListRole } from '@everylist/shared'
import type { ApiClient } from './client.js'
import { CliError, UsageError } from './errors.js'

/** A list as the CLI sees it: the token's granted role is always concrete (never `owner` or
 *  missing), since {@link grantedLists} overwrites it from the token's grants. */
export type GrantedList = ListDto & { role: Exclude<ListRole, 'owner'> }

/**
 * List/item resolution for commands that accept a name instead of an id.
 *
 * Both resolve against only the lists the *token* was granted, not every list the underlying
 * account can see: `GET /lists` returns all the user's accepted memberships regardless of a
 * PAT's grants, so filtering through `GET /tokens/me` is what keeps the CLI's view identical to
 * what the API will actually let this token read — the same discipline the MCP tools' access
 * layer applies. A list outside the grants simply doesn't exist here.
 */

/** The token's own grants (via the PAT-only self-introspection endpoint). */
export async function fetchAccessToken(client: ApiClient): Promise<AccessTokenDto> {
  return client.get<AccessTokenDto>('/api/v1/tokens/me')
}

/** Every live list the user is a member of, as the API returns them. */
export async function fetchLists(client: ApiClient): Promise<ListDto[]> {
  return client.get<ListDto[]>('/api/v1/lists')
}

/**
 * Intersects the account's lists with the token's grants, preserving the server's ordering, and
 * overwrites each list's `role` with the *token's* granted role. `GET /lists` reports the
 * account's membership role (which can be `owner`), but a PAT is always capped below owner — so
 * the token's grant is what the CLI can actually do, and showing the membership role would
 * overstate it. This mirrors the server's `ListPolicy.effectiveRole` reduction.
 */
export function grantedLists(lists: ListDto[], token: AccessTokenDto): GrantedList[] {
  const roleByListId = new Map(token.grants.map((grant) => [grant.listId, grant.role]))
  return lists
    .filter((list) => roleByListId.has(list.id))
    .map((list) => ({ ...list, role: roleByListId.get(list.id)! }))
}

/**
 * Resolves a `list` argument (an id or a name) against the token's granted lists. A name that
 * matches more than one list is refused rather than guessed — pass the id instead — so a write
 * can never silently land on the wrong list.
 */
export function resolveList(lists: GrantedList[], listArg: string): GrantedList {
  const trimmed = listArg.trim()
  if (/^\d+$/.test(trimmed)) {
    const byId = lists.find((list) => list.id === Number(trimmed))
    if (byId) return byId
    throw new CliError(`No list with id ${trimmed} is granted to this token.`)
  }

  const normalized = trimmed.toLowerCase()
  const matches = lists.filter((list) => list.name.trim().toLowerCase() === normalized)
  if (matches.length > 1) {
    throw new CliError(
      `More than one list is named "${trimmed}" (ids ${matches.map((l) => l.id).join(', ')}) — ` +
        'pass the id instead.'
    )
  }
  if (matches.length === 0) {
    throw new CliError(
      `No list named "${trimmed}" is granted to this token. Run \`everylist lists\` to see them.`
    )
  }
  return matches[0]!
}

/**
 * Resolves an `item` argument (an id or a name) within one list's items. A name prefers the open
 * (unchecked) row when a checked history row shares it — the same ordering the server's
 * `findItemByName` uses, so re-adding/editing doesn't resurrect the wrong row. An id must match
 * exactly; a name matching several open rows is refused.
 */
export function resolveItem(items: ItemDto[], itemArg: string): ItemDto {
  const trimmed = itemArg.trim()
  if (/^\d+$/.test(trimmed)) {
    const byId = items.find((item) => item.id === Number(trimmed))
    if (byId) return byId
    throw new CliError(`No item with id ${trimmed} on this list.`)
  }

  const normalized = trimmed.toLowerCase()
  const matches = items.filter((item) => item.name.trim().toLowerCase() === normalized)
  if (matches.length === 0) {
    throw new CliError(`No item named "${trimmed}" on this list.`)
  }

  const open = matches.filter((item) => !item.checked)
  const candidates = open.length > 0 ? open : matches
  if (candidates.length > 1) {
    throw new CliError(
      `More than one item is named "${trimmed}" (ids ${candidates.map((i) => i.id).join(', ')}) — ` +
        'pass the id instead.'
    )
  }
  return candidates[0]!
}

/** Requires a positional argument, throwing a usage error naming it when absent. */
export function requirePositional(positionals: string[], index: number, label: string): string {
  const value = positionals[index]
  if (value === undefined || value === '') {
    throw new UsageError(`Missing required argument: ${label}`)
  }
  return value
}
