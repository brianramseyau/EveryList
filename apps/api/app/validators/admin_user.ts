import vine from '@vinejs/vine'

/**
 * Shared rules for email and password — same shape as validators/user.ts, duplicated rather
 * than imported since those aren't exported for reuse and this file's rules diverge slightly
 * (password is optional on update).
 */
const email = () => vine.string().trim().toLowerCase().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

/** Validator for the primary account (user id 1) creating another user. */
export const adminCreateUserValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(150).nullable(),
  email: email().unique({ table: 'users', column: 'email', caseInsensitive: true }),
  password: password(),
  createDefaultLists: vine.boolean().optional(),
})

/**
 * Validator for the primary account editing another user. All fields optional — only the ones
 * present in the request are changed. `email`'s uniqueness check excludes the target user's own
 * row (via `field.meta.userId`, set by the controller from the route param) so re-submitting a
 * user's unchanged email doesn't spuriously fail as a duplicate.
 */
export const adminUpdateUserValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(150).nullable().optional(),
  email: email()
    .unique({
      table: 'users',
      column: 'email',
      caseInsensitive: true,
      filter: (db, _value, field) => {
        db.whereNot('id', field.meta.userId as number)
      },
    })
    .optional(),
  password: password().optional(),
  disabled: vine.boolean().optional(),
})
