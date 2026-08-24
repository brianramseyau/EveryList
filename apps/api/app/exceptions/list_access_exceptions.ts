import { createError } from '@adonisjs/core/exceptions'

/** Traceable context for a 404 raised by `ListPolicy` — who was asking, about what, and why it was denied. */
export type ListNotFoundContext = {
  userId: number
  listId?: number | string
  storeId?: number | string
  reason: 'not_found' | 'no_access'
}

const BaseListNotFoundException = createError('List not found', 'E_LIST_NOT_FOUND', 404)

/** Thrown when a list/store doesn't exist, or the user isn't an accepted member of it. */
export class ListNotFoundException extends BaseListNotFoundException {
  constructor(public readonly context: ListNotFoundContext) {
    super()
  }
}

/** Thrown when the user is a member but their role doesn't meet the action's minimum. */
export const ListForbiddenException = createError(
  'You do not have permission to perform this action',
  'E_LIST_FORBIDDEN',
  403
)
