import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Category from '#models/category'

/**
 * Global default categories (listId: null) used as the fallback aisle order
 * for every list until a list customizes its own — see PLAN.md §7.
 */
const DEFAULT_CATEGORIES = [
  { name: 'Produce', icon: 'fruitCherries' },
  { name: 'Dairy', icon: 'cheese' },
  { name: 'Meat', icon: 'foodDrumstick' },
  { name: 'Bakery', icon: 'breadSlice' },
  { name: 'Frozen', icon: 'snowflake' },
  { name: 'Pantry', icon: 'foodCanArrowUp' },
  { name: 'Household', icon: 'spray' },
  { name: 'Other', icon: 'dotsHorizontalCircle' },
] as const

export default class extends BaseSeeder {
  async run() {
    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      await Category.updateOrCreate(
        { name: category.name, listId: null, isDefault: true },
        { icon: category.icon, sortOrder: index }
      )
    }
  }
}
