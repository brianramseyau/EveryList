import { createError } from '@adonisjs/core/exceptions'

/** Thrown when a list/store doesn't exist, or the user isn't an accepted member of it. */
export const ListNotFoundException = createError('List not found', 'E_LIST_NOT_FOUND', 404)

/** Thrown when the user is a member but their role doesn't meet the action's minimum. */
export const ListForbiddenException = createError(
  'You do not have permission to perform this action',
  'E_LIST_FORBIDDEN',
  403
)
