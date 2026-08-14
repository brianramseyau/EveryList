import vine from '@vinejs/vine'

/** A link can never mint another owner — only editor/viewer. */
export const createListInviteValidator = vine.create({
  role: vine.enum(['editor', 'viewer'] as const),
})
