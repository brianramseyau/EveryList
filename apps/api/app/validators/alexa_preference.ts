import vine from '@vinejs/vine'

export const updateAlexaPreferenceValidator = vine.create({
  defaultListId: vine.number().positive().nullable().optional(),
  showChecked: vine.boolean().optional(),
})
