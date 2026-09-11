import vine from '@vinejs/vine'

/**
 * `haUsername: null` unlinks; a non-empty string (re)links — see `ha_link_controller.ts`.
 * `password` is required unless `haUsername` matches the caller's currently Supervisor-detected
 * identity (already proven via headers, no password needed) — linking a username with no proof
 * at all would let anyone squat a real Home Assistant user's username and silently receive their
 * future implicit sign-ins into the squatter's own EveryList account.
 */
export const updateUserHassLinkValidator = vine.create({
  haUsername: vine.string().trim().minLength(1).maxLength(255).nullable(),
  password: vine.string().minLength(1).optional(),
})
