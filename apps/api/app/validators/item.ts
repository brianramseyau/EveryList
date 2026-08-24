import vine from '@vinejs/vine'

export const createItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200),
  quantity: vine.string().trim().maxLength(50).nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  categoryId: vine.number().positive().nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  price: vine.number().min(0).nullable().optional(),
})

export const updateItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200).optional(),
  quantity: vine.string().trim().maxLength(50).nullable().optional(),
  notes: vine.string().trim().maxLength(1000).nullable().optional(),
  categoryId: vine.number().positive().nullable().optional(),
  storeId: vine.number().positive().nullable().optional(),
  price: vine.number().min(0).nullable().optional(),
  checked: vine.boolean().optional(),
  sortOrder: vine.number().optional(),
  expectedVersion: vine.number().optional(),
})

export const importItemsValidator = vine.create({
  text: vine.string().trim().minLength(1).maxLength(20_000),
})

export const moveItemValidator = vine.create({
  // The item this one should be placed immediately after — omitted/null moves it to the front
  // of the list. See ItemsController#move.
  previousItemId: vine.number().positive().nullable().optional(),
  expectedVersion: vine.number().optional(),
})

export const moveItemToListValidator = vine.create({
  destinationListId: vine.number().positive(),
  expectedVersion: vine.number().optional(),
})
