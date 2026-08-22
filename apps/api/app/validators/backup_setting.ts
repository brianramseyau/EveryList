import vine from '@vinejs/vine'

export const updateBackupSettingValidator = vine.create({
  frequency: vine.enum(['daily', 'weekly', 'monthly'] as const),
  timeOfDay: vine.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  retentionCount: vine.number().min(1).max(60),
})
