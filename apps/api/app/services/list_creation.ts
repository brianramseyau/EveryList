import List from '#models/list'
import ListMember from '#models/list_member'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { seedStarterCategories } from '#services/category_service'

export interface CreateOwnedListInput {
  ownerId: number
  name: string
  color: string
  icon: string | null
  useCategories?: boolean
  /** Only for a brand-new user's very first list — see #controllers/new_account_controller. */
  seedStarterCategories?: boolean
}

/** Creates a list, grants its creator the `owner` membership role, and broadcasts the create. */
export async function createOwnedList(input: CreateOwnedListInput) {
  const list = await List.create({
    name: input.name,
    color: input.color,
    icon: input.icon,
    ownerId: input.ownerId,
    archived: false,
    useCategories: input.useCategories ?? true,
    version: 1,
  })

  const now = DateTime.now()
  await ListMember.create({
    listId: list.id,
    userId: input.ownerId,
    role: 'owner',
    invitedAt: now,
    acceptedAt: now,
  })

  await broadcastSync({
    listId: list.id,
    entityType: 'list',
    entityId: list.id,
    op: 'create',
    version: list.version,
  })

  if (input.seedStarterCategories) {
    await seedStarterCategories(list)
  }

  return list
}
