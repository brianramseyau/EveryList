import vine from '@vinejs/vine'

/**
 * Shared rules for email and password — same shape as validators/user.ts and
 * validators/admin_user.ts, duplicated rather than imported since those aren't exported for
 * reuse (see admin_user.ts's comment on why each validator file keeps its own copy).
 */
const email = () => vine.string().trim().toLowerCase().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

/**
 * Validator for `POST /api/v1/setup` — creates the instance's owner account (user id 1) and
 * confirms initial server settings in one step. The controller re-checks that no user exists yet
 * before acting on this, so `email` doesn't need a uniqueness check here (the table is empty by
 * the time this can succeed) — same reasoning `user:create`'s command-line validators skip it.
 * The nested `backup` rules mirror validators/backup_setting.ts's `updateBackupSettingValidator`.
 */
export const setupValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(150).nullable(),
  email: email(),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
  backup: vine.object({
    frequency: vine.enum(['daily', 'weekly', 'monthly'] as const),
    timeOfDay: vine.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    retentionCount: vine.number().min(1).max(60),
  }),
})
