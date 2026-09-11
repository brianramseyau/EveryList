import vine from '@vinejs/vine'

/**
 * The explicit "sign in with a different Home Assistant account" form
 * (`ha_auth_controller.ts#login`) — no format assumptions on `username` the way `#validators/
 * user.ts`'s `email()` assumes an email, since HA usernames aren't email addresses.
 */
export const haLoginValidator = vine.create({
  username: vine.string().trim().minLength(1),
  password: vine.string().minLength(1),
})
