import vine from '@vinejs/vine'

export const createSubItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200),
})

export const updateSubItemValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(200).optional(),
  checked: vine.boolean().optional(),
  expectedVersion: vine.number().optional(),
})

export const moveSubItemValidator = vine.create({
  // The sub-item this one should be placed immediately after — omitted/null moves
  // it to the front of its parent's checklist. See SubItemsController#move.
  previousSubItemId: vine.number().positive().nullable().optional(),
  expectedVersion: vine.number().optional(),
})
