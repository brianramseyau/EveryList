import vine from '@vinejs/vine'

/** A PAT can never mint another owner — only editor/viewer, mirroring list invites. */
export const createPersonalAccessTokenValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(100),
  listIds: vine.array(vine.number().positive()).minLength(1),
  role: vine.enum(['editor', 'viewer'] as const),
})

/**
 * Replaces a token's entire grant set in one shot (same shape as `create` minus
 * `name` being optional) rather than accepting an add/remove diff — a token has
 * always had one role applied uniformly across all its lists, so there's no
 * partial-update shape that wouldn't require re-deriving that invariant anyway.
 */
export const updatePersonalAccessTokenValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(100).optional(),
  listIds: vine.array(vine.number().positive()).minLength(1),
  role: vine.enum(['editor', 'viewer'] as const),
})
