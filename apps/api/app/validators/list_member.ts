import vine from '@vinejs/vine'

/** Can't promote to, or demote from, owner via this endpoint. */
export const updateListMemberRoleValidator = vine.create({
  role: vine.enum(['editor', 'viewer'] as const),
})

/**
 * Directly adds an existing user who already shares another list with the
 * requester. Like link invites, a direct add can never mint an owner.
 */
export const createListMemberValidator = vine.create({
  userId: vine.number().positive(),
  role: vine.enum(['editor', 'viewer'] as const),
})
