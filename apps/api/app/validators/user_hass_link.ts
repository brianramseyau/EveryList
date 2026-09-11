import vine from '@vinejs/vine'

/**
 * `haUsername: null` unlinks; a non-empty string (re)links — see `ha_link_controller.ts`.
 */
export const updateUserHassLinkValidator = vine.create({
  haUsername: vine.string().trim().minLength(1).maxLength(255).nullable(),
})
