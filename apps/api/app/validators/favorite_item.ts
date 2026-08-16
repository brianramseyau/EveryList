import vine from '@vinejs/vine'

export const createFavoriteItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200),
  defaultCategoryId: vine.number().positive().nullable().optional(),
  defaultQuantity: vine.string().trim().maxLength(50).nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  price: vine.number().min(0).nullable().optional(),
})

export const updateFavoriteItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200).optional(),
  defaultCategoryId: vine.number().positive().nullable().optional(),
  defaultQuantity: vine.string().trim().maxLength(50).nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  price: vine.number().min(0).nullable().optional(),
  expectedVersion: vine.number().optional(),
})
