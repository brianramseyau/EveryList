import List from '#models/list'
import ListMember from '#models/list_member'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'

export interface CreateOwnedListInput {
  ownerId: number
  name: string
  color: string
  icon: string | null
}

/** Creates a list, grants its creator the `owner` membership role, and broadcasts the create. */
export async function createOwnedList(input: CreateOwnedListInput) {
  const list = await List.create({
    name: input.name,
    color: input.color,
    icon: input.icon,
    ownerId: input.ownerId,
    archived: false,
  })

  const now = DateTime.now()
  await ListMember.create({
    listId: list.id,
    userId: input.ownerId,
    role: 'owner',
    invitedAt: now,
    acceptedAt: now,
  })

  await broadcastSync({ listId: list.id, entityType: 'list', entityId: list.id, op: 'create' })

  return list
}
