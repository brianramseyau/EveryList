import vine from '@vinejs/vine'

export const createFolderValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  color: vine.string().trim().optional(),
})

export const updateFolderValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  color: vine.string().trim().optional(),
  sortOrder: vine.number().optional(),
  expectedVersion: vine.number().optional(),
})
