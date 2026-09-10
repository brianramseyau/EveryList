import vine from '@vinejs/vine'

/** All fields optional — a partial update, same merge semantics as `updateBackupSettingValidator`.
 * Rejecting an env-locked field happens in the controller/service, not here, since that depends
 * on which env vars are currently set. */
export const updateServerConfigValidator = vine.create({
  publicSignupEnabled: vine.boolean().optional(),
  appUrl: vine.string().url().optional(),
  mailHost: vine.string().trim().minLength(1).optional(),
  mailPort: vine.number().min(1).max(65535).optional(),
  mailUsername: vine.string().trim().optional(),
  mailPassword: vine.string().optional(),
  mailFromAddress: vine.string().email().optional(),
  mailFromName: vine.string().trim().minLength(1).optional(),
  alexaSkillId: vine.string().trim().optional(),
  authentikTokenUrl: vine.string().url().optional(),
  authentikUserinfoUrl: vine.string().url().optional(),
  authentikClientId: vine.string().trim().optional(),
  authentikClientSecret: vine.string().optional(),
})
