import vine from '@vinejs/vine'

const email = () => vine.string().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

/**
 * Validator for POST /auth/forgot-password — requests a reset link for an
 * account. The response is intentionally identical whether or not the email
 * exists (always 204) so the endpoint can't be used to enumerate accounts.
 */
export const forgotPasswordValidator = vine.create({
  email: email(),
})

/**
 * Validator for POST /auth/reset-password — consumes a reset token and sets
 * a new password.
 */
export const resetPasswordValidator = vine.create({
  token: vine.string().minLength(1).maxLength(512),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})
