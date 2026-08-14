import vine from '@vinejs/vine'

export const createItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200),
  quantity: vine.string().trim().maxLength(50).nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  categoryId: vine.number().positive().nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
})

export const updateItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200).optional(),
  quantity: vine.string().trim().maxLength(50).nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  categoryId: vine.number().positive().nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  checked: vine.boolean().optional(),
  sortOrder: vine.number().optional(),
  expectedVersion: vine.number().optional(),
})

export const importItemsValidator = vine.create({
  text: vine.string().trim().minLength(1).maxLength(20_000),
})
