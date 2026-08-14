import vine from '@vinejs/vine'

/** Attaches an existing store to a list (storeId) or creates+attaches a new one (name). */
export const attachStoreValidator = vine.create({
  storeId: vine.number().positive().optional(),
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  color: vine.string().trim().optional(),
})

export const updateStoreValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  color: vine.string().trim().optional(),
  expectedVersion: vine.number().optional(),
})

export const reorderStoreCategoriesValidator = vine.create({
  categories: vine.array(
    vine.object({
      categoryId: vine.number().positive(),
      sortOrder: vine.number(),
    })
  ),
})
