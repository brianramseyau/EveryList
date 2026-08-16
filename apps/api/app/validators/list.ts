import vine from '@vinejs/vine'

export const createListValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  color: vine.string().trim().optional(),
  icon: vine.string().trim().nullable().optional(),
  useCategories: vine.boolean().optional(),
})

export const updateListValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  color: vine.string().trim().optional(),
  icon: vine.string().trim().nullable().optional(),
  archived: vine.boolean().optional(),
  badgeExcluded: vine.boolean().optional(),
  useCategories: vine.boolean().optional(),
  folderId: vine.number().positive().nullable().optional(),
  passcodeHash: vine.string().trim().maxLength(200).nullable().optional(),
  expectedVersion: vine.number().optional(),
})
