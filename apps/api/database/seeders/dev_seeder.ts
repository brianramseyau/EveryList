import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import User from '#models/user'
import Folder from '#models/folder'
import List from '#models/list'
import ListMember from '#models/list_member'
import Store from '#models/store'
import Category from '#models/category'
import Item from '#models/item'
import ListStore from '#models/list_store'

/**
 * Local dev convenience data: two users (one shared list between them),
 * a folder, a few lists/stores/categories, and a handful of items — so
 * `pnpm db:reset` leaves something to click around in instead of a blank
 * account. Restricted to `development` so it never touches test or prod
 * databases.
 *
 * Login: dev@example.com / password (owns "Groceries" + "Hardware Store",
 * and views partner@example.com's "Weekend BBQ").
 */
export default class extends BaseSeeder {
  static environment = ['development']

  async run() {
    const dev = await User.firstOrCreate(
      { email: 'dev@example.com' },
      { fullName: 'Dev User', email: 'dev@example.com', password: 'password' }
    )
    const partner = await User.firstOrCreate(
      { email: 'partner@example.com' },
      { fullName: 'Partner User', email: 'partner@example.com', password: 'password' }
    )

    const folder = await Folder.firstOrCreate(
      { userId: dev.id, name: 'Personal' },
      { userId: dev.id, name: 'Personal', color: '#8b5cf6' }
    )

    const groceries = await List.firstOrCreate(
      { ownerId: dev.id, name: 'Groceries' },
      {
        ownerId: dev.id,
        name: 'Groceries',
        color: '#22c55e',
        icon: 'basket',
        folderId: folder.id,
      }
    )
    await addMember(groceries.id, dev.id, 'owner')
    await addMember(groceries.id, partner.id, 'editor')

    const hardware = await List.firstOrCreate(
      { ownerId: dev.id, name: 'Hardware Store' },
      { ownerId: dev.id, name: 'Hardware Store', color: '#f97316', icon: 'toolbox' }
    )
    await addMember(hardware.id, dev.id, 'owner')

    const bbq = await List.firstOrCreate(
      { ownerId: partner.id, name: 'Weekend BBQ' },
      { ownerId: partner.id, name: 'Weekend BBQ', color: '#ef4444', icon: 'grill' }
    )
    await addMember(bbq.id, partner.id, 'owner')
    await addMember(bbq.id, dev.id, 'viewer')

    const traderJoes = await Store.firstOrCreate(
      { createdBy: dev.id, name: "Trader Joe's" },
      { createdBy: dev.id, name: "Trader Joe's", color: '#dc2626' }
    )
    const costco = await Store.firstOrCreate(
      { createdBy: dev.id, name: 'Costco' },
      { createdBy: dev.id, name: 'Costco', color: '#2563eb' }
    )
    const homeDepot = await Store.firstOrCreate(
      { createdBy: dev.id, name: 'Home Depot' },
      { createdBy: dev.id, name: 'Home Depot', color: '#f97316' }
    )
    await attachStore(groceries.id, traderJoes.id)
    await attachStore(groceries.id, costco.id)
    await attachStore(hardware.id, homeDepot.id)

    const produce = await Category.firstOrCreate(
      { listId: groceries.id, name: 'Produce' },
      {
        listId: groceries.id,
        name: 'Produce',
        icon: 'fruitCherries',
        isDefault: false,
        sortOrder: 0,
      }
    )
    const dairy = await Category.firstOrCreate(
      { listId: groceries.id, name: 'Dairy' },
      { listId: groceries.id, name: 'Dairy', icon: 'cheese', isDefault: false, sortOrder: 1 }
    )
    const pantry = await Category.firstOrCreate(
      { listId: groceries.id, name: 'Pantry' },
      {
        listId: groceries.id,
        name: 'Pantry',
        icon: 'foodCanArrowUp',
        isDefault: false,
        sortOrder: 2,
      }
    )
    const household = await Category.firstOrCreate(
      { listId: groceries.id, name: 'Household' },
      { listId: groceries.id, name: 'Household', icon: 'spray', isDefault: false, sortOrder: 3 }
    )
    const tools = await Category.firstOrCreate(
      { listId: hardware.id, name: 'Tools' },
      { listId: hardware.id, name: 'Tools', icon: 'toolbox', isDefault: false, sortOrder: 0 }
    )

    await seedItems(groceries.id, dev.id, [
      {
        name: 'Bananas',
        categoryId: produce.id,
        storeId: traderJoes.id,
        quantity: '1 bunch',
      },
      { name: 'Spinach', categoryId: produce.id, storeId: traderJoes.id, checked: true },
      { name: 'Milk', categoryId: dairy.id, storeId: costco.id, quantity: '1 gal' },
      { name: 'Eggs', categoryId: dairy.id, storeId: costco.id, quantity: '2 dozen' },
      { name: 'Rice', categoryId: pantry.id, storeId: costco.id, price: 8.99 },
      { name: 'Paper towels', categoryId: household.id, storeId: costco.id },
    ])

    await seedItems(hardware.id, dev.id, [
      { name: 'Wood screws', categoryId: tools.id, storeId: homeDepot.id, quantity: '1 box' },
      { name: 'Cordless drill', categoryId: tools.id, storeId: homeDepot.id, price: 129.0 },
      { name: 'Sandpaper', categoryId: tools.id, storeId: homeDepot.id, checked: true },
    ])

    await seedItems(bbq.id, partner.id, [
      { name: 'Burger patties', categoryId: null, quantity: '2 lbs' },
      { name: 'Buns', categoryId: null, quantity: '8 ct' },
      { name: 'Charcoal', categoryId: null, notes: 'the big bag' },
    ])
  }
}

async function addMember(listId: number, userId: number, role: 'owner' | 'editor' | 'viewer') {
  const now = DateTime.now()
  await ListMember.firstOrCreate(
    { listId, userId },
    { listId, userId, role, invitedAt: now, acceptedAt: now }
  )
}

async function attachStore(listId: number, storeId: number) {
  await ListStore.firstOrCreate({ listId, storeId }, { listId, storeId })
}

interface SeedItemInput {
  name: string
  categoryId: number | null
  storeId?: number
  quantity?: string
  notes?: string
  price?: number
  checked?: boolean
}

async function seedItems(listId: number, createdBy: number, items: SeedItemInput[]) {
  for (const [index, item] of items.entries()) {
    await Item.firstOrCreate(
      { listId, name: item.name },
      {
        listId,
        createdBy,
        name: item.name,
        categoryId: item.categoryId,
        storeId: item.storeId ?? null,
        quantity: item.quantity ?? null,
        notes: item.notes ?? null,
        price: item.price ?? null,
        checked: item.checked ?? false,
        checkedAt: item.checked ? DateTime.now() : null,
        sortOrder: index,
      }
    )
  }
}
