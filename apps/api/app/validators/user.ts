import vine from '@vinejs/vine'

/**
 * Shared rules for email and password.
 */
const email = () => vine.string().trim().toLowerCase().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

/**
 * Validator to use when performing self-signup
 */
export const signupValidator = vine.create({
  fullName: vine.string().nullable(),
  email: email().unique({ table: 'users', column: 'email', caseInsensitive: true }),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
  // Present when signing up via a list join link, so signup can proceed
  // even while public signup is disabled.
  inviteToken: vine.string().optional(),
})

/**
 * Validator to use before validating user credentials
 * during login
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})

/**
 * Validator to use when a user edits their own profile.
 */
export const updateProfileValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(150).nullable(),
})

/**
 * Validator for a logged-in user changing their own password from Settings.
 * Requires the current password (unlike the email-token reset flow), since
 * there's no separate proof of identity here. `signOutOtherDevices` is opt-in
 * — a routine hygiene change shouldn't force every other session to log back
 * in, but the user should be able to choose that when they suspect
 * compromise.
 */
export const updatePasswordValidator = vine.create({
  currentPassword: vine.string(),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
  signOutOtherDevices: vine.boolean().optional(),
})
