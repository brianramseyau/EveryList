import ListMember from '#models/list_member'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'

/** Next per-user `sort_order` for a new `list_members` row — new memberships
 * (owning a fresh list, or accepting an invite) append to the end of that
 * user's list ordering rather than defaulting to 0, which would otherwise
 * jump the new list to the top of their Lists page. Mirrors
 * `FoldersController`'s `nextSortOrder` helper. */
export async function nextListMemberSortOrder(
  userId: number,
  client?: QueryClientContract
): Promise<number> {
  const query = client ? ListMember.query({ client }) : ListMember.query()
  const result = await query.where('userId', userId).max('sort_order as maxSortOrder').first()
  const nextSortOrder = Number(result?.$extras.maxSortOrder ?? -1) + 1
  logger.debug({ userId, nextSortOrder }, 'computed next list member sort order')
  return nextSortOrder
}
