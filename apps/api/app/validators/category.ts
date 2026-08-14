import vine from '@vinejs/vine'

export const createCategoryValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(80),
  icon: vine.string().trim().minLength(1).maxLength(80),
})

export const updateCategoryValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(80).optional(),
  icon: vine.string().trim().minLength(1).maxLength(80).optional(),
  expectedVersion: vine.number().optional(),
})

export const reorderCategoriesValidator = vine.create({
  order: vine.array(vine.number().positive()).minLength(1),
})
