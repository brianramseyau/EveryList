import vine from '@vinejs/vine'

export const createListValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  color: vine.string().trim().optional(),
  icon: vine.string().trim().nullable().optional(),
  useCategories: vine.boolean().optional(),
  useShops: vine.boolean().optional(),
  useFavorites: vine.boolean().optional(),
  useRecent: vine.boolean().optional(),
  useQuantity: vine.boolean().optional(),
  usePrice: vine.boolean().optional(),
  showStoreInList: vine.boolean().optional(),
  showPriceInList: vine.boolean().optional(),
  itemSortOrder: vine.enum(['ranked', 'alphabetical'] as const).optional(),
  insertPosition: vine.enum(['top', 'bottom'] as const).optional(),
})

export const updateListValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  color: vine.string().trim().optional(),
  icon: vine.string().trim().nullable().optional(),
  archived: vine.boolean().optional(),
  badgeExcluded: vine.boolean().optional(),
  useCategories: vine.boolean().optional(),
  useShops: vine.boolean().optional(),
  useFavorites: vine.boolean().optional(),
  useRecent: vine.boolean().optional(),
  useQuantity: vine.boolean().optional(),
  usePrice: vine.boolean().optional(),
  showStoreInList: vine.boolean().optional(),
  showPriceInList: vine.boolean().optional(),
  itemSortOrder: vine.enum(['ranked', 'alphabetical'] as const).optional(),
  insertPosition: vine.enum(['top', 'bottom'] as const).optional(),
  folderId: vine.number().positive().nullable().optional(),
  passcodeHash: vine.string().trim().maxLength(200).nullable().optional(),
  expectedVersion: vine.number().optional(),
})

export const reorderListsValidator = vine.create({
  order: vine.array(vine.number().positive()).minLength(1),
})
