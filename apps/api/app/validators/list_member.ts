import vine from '@vinejs/vine'

/** Can't promote to, or demote from, owner via this endpoint. */
export const updateListMemberRoleValidator = vine.create({
  role: vine.enum(['editor', 'viewer'] as const),
})
