import vine from '@vinejs/vine'

/** A PAT can never mint another owner — only editor/viewer, mirroring list invites. */
export const createPersonalAccessTokenValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(100),
  listIds: vine.array(vine.number().positive()).minLength(1),
  role: vine.enum(['editor', 'viewer'] as const),
})
