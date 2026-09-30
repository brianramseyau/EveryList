import type User from '#models/user'
import type List from '#models/list'
import type Item from '#models/item'
import ListMember, { type ListRole } from '#models/list_member'
import ListPolicy, { ROLE_RANK } from '#policies/list_policy'
import { accessibleLists } from '#services/alexa/list_resolution'

/**
 * Shared access/lookup layer for the MCP tools (foundational/PLAN_32_PHASE_MCP_SERVER.md).
 *
 * Deliberately thin: every authorization decision routes through `ListPolicy` — the same policy
 * every HTTP route uses — so a PAT's per-list grants (`list:<id>:<role>` abilities, reduced by
 * `effectiveRole`) are the single source of truth here too. What this layer adds is only what
 * the tools share with each other: turning a tool argument (`list` as id or name) into one of
 * the token's accessible lists, and a compact item projection for tool responses.
 */

/**
 * The lists the calling user may see at all: the token's own grants, further reduced by the
 * user's *current* accepted membership via `ListPolicy.effectiveRole`. The membership filter
 * matters — a PAT grant outlives the membership it was minted against, so without it a token
 * could still read (and, for editor-granted lists, write) a list the account has since left.
 * A list failing either check simply doesn't exist for the MCP client, so a wrong name and an
 * unauthorized one are indistinguishable (no probing).
 */
export async function grantedLists(user: User): Promise<List[]> {
  const token = user.currentAccessToken
  if (!token) return []

  const accessible = await accessibleLists(token)
  if (accessible.length === 0) return []

  // One query for all the accepted memberships among the token's granted lists, then reduce each
  // through `effectiveRole` (which also honours the token's own editor/viewer cap).
  const memberships = await ListMember.query()
    .where('userId', user.id)
    .whereNotNull('acceptedAt')
    .whereIn(
      'listId',
      accessible.map((list) => list.id)
    )
  const roleByList = new Map(memberships.map((member) => [member.listId, member.role as ListRole]))

  return accessible.filter((list) => {
    const membershipRole = roleByList.get(list.id)
    return membershipRole !== undefined && ListPolicy.effectiveRole(user, list.id, membershipRole)
  })
}

/**
 * Resolves a tool's `list` argument — an exact (case-insensitive, trimmed) list id or list
 * name within the user's granted lists. A name matching more than one list is refused rather
 * than silently picking one, so a write can never land on the wrong list; the caller should
 * pass the id instead.
 */
export async function resolveGrantedList(
  user: User,
  listArg: string | number
): Promise<List | null> {
  const asNumber =
    typeof listArg === 'number' ? listArg : /^\d+$/.test(listArg.trim()) ? Number(listArg) : null

  const accessible = await grantedLists(user)

  if (asNumber !== null) {
    return accessible.find((list) => list.id === asNumber) ?? null
  }

  const normalized = String(listArg).trim().toLowerCase()
  const matches = accessible.filter((list) => list.name.trim().toLowerCase() === normalized)
  if (matches.length > 1) {
    throw new McpListAccessError(
      'ambiguous',
      matches.map((list) => list.id)
    )
  }
  return matches[0] ?? null
}

/**
 * The tool-error contract, mirroring HTTP controllers' `requireList`: a list that doesn't exist
 * and a list the user has no access to are the same "not found" (no probe), a role shortage is
 * "forbidden", and a name matching several lists is "ambiguous" (so a write can't guess).
 */
export class McpListAccessError extends Error {
  constructor(
    public kind: 'not_found' | 'forbidden' | 'ambiguous',
    public listIds: number[] = []
  ) {
    super(
      kind === 'not_found'
        ? 'List not found.'
        : kind === 'forbidden'
          ? 'Your token only has view access to this list.'
          : 'More than one list has that name — pass the list id instead.'
    )
  }
}

/**
 * A business-rule refusal a tool should surface to the model as an error content row (the
 * unchecked-item limit, sub-task gate, …), carrying the same human message the HTTP paths'
 * services produce.
 */
export class McpToolError extends Error {}

/**
 * Loads the list for a tool call, enforcing the PAT's effective role — the single gate every
 * tool funnels through (the repo's Critical review item: no path reaches list data without
 * ListPolicy). `grantedLists`/`resolveGrantedList` have already filtered to the user's granted,
 * currently-membered, live lists; the role check here is `ListPolicy.roleFor`, the same
 * membership + PAT reduction every HTTP route uses.
 */
export async function requireGrantedList(
  user: User,
  listArg: string | number,
  minRole: ListRole = 'viewer'
): Promise<List> {
  const resolved = await resolveGrantedList(user, listArg)
  // A name/id outside the user's grants behaves exactly like a membership miss: 404-shaped,
  // indistinguishable from a wrong id, no per-list probing.
  if (!resolved) throw new McpListAccessError('not_found')

  const role = await ListPolicy.roleFor(user, resolved.id)
  /* c8 ignore start -- `grantedLists` already proved an accepted membership moments ago; this
   * re-check is defense-in-depth against that membership being revoked mid-request. */
  if (!role) throw new McpListAccessError('not_found')
  /* c8 ignore stop */
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new McpListAccessError('forbidden')

  return resolved
}

/**
 * Runs a tool's list-scoped body behind `requireGrantedList`'s gate, mapping the denial kinds
 * to the tool-error content MCP surfaces to the model. Every tool wraps its `requireGrantedList`
 * call with this so the wording exists exactly once.
 */
export async function withListAccess<T>(
  body: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await body() }
  } catch (error) {
    if (error instanceof McpListAccessError) {
      return {
        ok: false,
        error:
          error.kind === 'not_found'
            ? 'List not found (or not granted to this token). Use list_lists first.'
            : error.kind === 'forbidden'
              ? 'Your token only has view access to this list.'
              : error.message,
      }
    }
    if (error instanceof McpToolError) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}

/**
 * Compact item projection for tool responses. Not the full ItemTransformer DTO — tools return
 * what a model can actually act on (identity, checked state, category/store/price/quantity/
 * notes/deadline/subtasks), with timestamps dropped. `categoryId`/`storeId` are still ids;
 * callers that need names join via the list's categories (get_list reads them back with the
 * list itself).
 */
export function itemProjection(item: Item) {
  return {
    id: item.id,
    name: item.name,
    checked: item.checked,
    quantity: item.quantity,
    price: item.price,
    notes: item.notes,
    deadline: item.deadline,
    categoryId: item.categoryId,
    storeId: item.storeId,
    version: item.version,
    subItems:
      item.subItems?.map((sub) => ({
        id: sub.id,
        name: sub.name,
        checked: sub.checked,
        version: sub.version,
      })) ?? undefined,
  }
}
