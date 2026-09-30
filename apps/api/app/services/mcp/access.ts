import type User from '#models/user'
import type List from '#models/list'
import type Item from '#models/item'
import ListPolicy, { ROLE_RANK } from '#policies/list_policy'
import type { ListRole } from '#models/list_member'
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
 * The lists a PAT is allowed to see at all — the token's own grants (via
 * `list_resolution.accessibleLists`, mirroring `ListPolicy.effectiveRole`'s PAT reduction
 * without a membership round-trip). Every read tool and every list-name resolution reads this;
 * a list without a grant on this token simply doesn't exist for the MCP client, so a wrong
 * name and an unauthorized one are indistinguishable (no probing).
 */
export function grantedLists(token: User['currentAccessToken']): Promise<List[]> {
  if (!token) return Promise.resolve([])
  return accessibleLists(token)
}

/**
 * Resolves a tool's `list` argument — an exact (case-insensitive, trimmed) list id or list
 * name within the token's grants. Names are matched exactly rather than fuzzily (unlike
 * Alexa's spoken-name resolution): an MCP client has model-guided arguments, not
 * transcription noise, and a wrong-but-similar name should fail loudly rather than silently
 * write to a different list.
 */
export async function resolveGrantedList(
  token: NonNullable<User['currentAccessToken']> | undefined,
  listArg: string | number
): Promise<List | null> {
  if (!token) return null

  const asNumber =
    typeof listArg === 'number' ? listArg : /^\d+$/.test(listArg.trim()) ? Number(listArg) : null

  const accessible = await grantedLists(token)

  if (asNumber !== null) {
    return accessible.find((list) => list.id === asNumber) ?? null
  }

  const normalized = String(listArg).trim().toLowerCase()
  return accessible.find((list) => list.name.trim().toLowerCase() === normalized) ?? null
}

/**
 * The tool-error contract: like HTTP controllers' `requireList`, a list that doesn't exist and
 * a list the token has no grant on are the same "not found" (no probe), while a real role
 * shortage is a distinct "forbidden". Tools map these to their response shape.
 */
export class McpListAccessError extends Error {
  constructor(public kind: 'not_found' | 'forbidden') {
    super(
      kind === 'not_found' ? 'List not found.' : 'Your token only has view access to this list.'
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
 * ListPolicy). `resolveGrantedList` has already filtered to this token's grants and to live
 * (non-deleted) lists; the role check here is `ListPolicy.roleFor`, the same membership + PAT
 * reduction every HTTP route uses, so a viewer can read but never write and a stale grant
 * (the account has since left) reads as not-found rather than a raw error.
 */
export async function requireGrantedList(
  user: User,
  listArg: string | number,
  minRole: ListRole = 'viewer'
): Promise<List> {
  const resolved = await resolveGrantedList(user.currentAccessToken, listArg)
  // A name/id outside the token's grants behaves exactly like a membership miss: 404-shaped,
  // indistinguishable from a wrong id, no per-list probing.
  if (!resolved) throw new McpListAccessError('not_found')

  const role = await ListPolicy.roleFor(user, resolved.id)
  if (!role) throw new McpListAccessError('not_found')
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new McpListAccessError('forbidden')

  return resolved
}

/**
 * Runs a tool's list-scoped body behind `requireGrantedList`'s gate, mapping the two denial
 * kinds to the tool-error content MCP surfaces to the model. Every tool wraps its
 * `requireGrantedList` call with this so the not-found/forbidden wording exists exactly once.
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
            : 'Your token only has view access to this list.',
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
