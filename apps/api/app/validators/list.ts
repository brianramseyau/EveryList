import vine from '@vinejs/vine'

export const createListValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  color: vine.string().trim().optional(),
  icon: vine.string().trim().nullable().optional(),
})

export const updateListValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  color: vine.string().trim().optional(),
  icon: vine.string().trim().nullable().optional(),
  archived: vine.boolean().optional(),
  expectedVersion: vine.number().optional(),
})
