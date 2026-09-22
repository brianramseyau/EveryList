import type Item from '#models/item'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { recurrenceDto } from '#services/item_recurrence_service'
import SubItemTransformer from '#transformers/sub_item_transformer'

export default class ItemTransformer extends BaseTransformer<Item> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'listId',
        'name',
        'quantity',
        'notes',
        'categoryId',
        'storeId',
        'price',
        'deadline',
        'checked',
        'checkedAt',
        'sortOrder',
        'createdBy',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'version',
      ]),
      // Only present when the caller preloaded `recurrence` (null = preloaded, doesn't repeat) —
      // see foundational/PLAN_30_PHASE_RECURRING_ITEMS.md.
      recurrence: this.resource.$hasRelated('recurrence')
        ? this.resource.recurrence
          ? recurrenceDto(this.resource.recurrence)
          : null
        : undefined,
      // Only present when the caller preloaded `subItems` (the list index
      // fetch does; a single-item mutation response does not) — see
      // foundational/PLAN_29_PHASE_SUBTASKS.md.
      subItems: this.resource.$hasRelated('subItems')
        ? SubItemTransformer.transform(this.resource.subItems)
        : undefined,
    }
  }
}
