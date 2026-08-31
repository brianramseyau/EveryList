import List from '#models/list'
import ListMember from '#models/list_member'
import Item from '#models/item'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { seedStarterCategories } from '#services/category_service'
import { nextListMemberSortOrder } from '#services/list_member_sort'
import logger from '@adonisjs/core/services/logger'

/**
 * Short, self-descriptive onboarding tasks seeded only into a brand-new user's
 * "Todos" starter list (see #controllers/new_account_controller) — each one
 * teaches a real item interaction (check off, delete, edit, reorder) by
 * describing the actual gesture, so a first-time user learns the app by using
 * it rather than reading a separate tutorial.
 */
const STARTER_TODO_ITEMS = [
  'Tap to cross this off',
  'Swipe left to delete, or use the pencil icon on desktop',
  'Swipe right to edit, or tap the pencil icon on desktop',
  'Press and hold, then drag to reorder',
  'Add your first real to-do',
] as const

export async function seedStarterTodoItems(list: List, ownerId: number): Promise<Item[]> {
  const items: Item[] = []

  for (const [index, name] of STARTER_TODO_ITEMS.entries()) {
    const item = await Item.create({
      listId: list.id,
      name,
      checked: false,
      sortOrder: index,
      createdBy: ownerId,
      version: 1,
    })
    items.push(item)

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'create',
      version: item.version,
    })
  }

  logger.debug({ listId: list.id, itemCount: items.length }, 'seeded starter todo items')

  return items
}

export interface CreateOwnedListInput {
  ownerId: number
  name: string
  color: string
  icon: string | null
  useCategories?: boolean
  useCategoryLearning?: boolean
  useShops?: boolean
  useFavorites?: boolean
  useRecent?: boolean
  useQuantity?: boolean
  usePrice?: boolean
  showStoreInList?: boolean
  showPriceInList?: boolean
  itemSortOrder?: 'ranked' | 'alphabetical'
  insertPosition?: 'top' | 'bottom'
  /** Only for a brand-new user's very first list — see #controllers/new_account_controller. */
  seedStarterCategories?: boolean
  /** Only for a brand-new user's "Todos" starter list — see #controllers/new_account_controller. */
  seedStarterTodoItems?: boolean
}

/** Creates a list, grants its creator the `owner` membership role, and broadcasts the create. */
export async function createOwnedList(input: CreateOwnedListInput) {
  const list = await List.create({
    name: input.name,
    color: input.color,
    icon: input.icon,
    ownerId: input.ownerId,
    archived: false,
    useCategories: input.useCategories ?? true,
    useCategoryLearning: input.useCategoryLearning ?? true,
    useShops: input.useShops ?? true,
    useFavorites: input.useFavorites ?? true,
    useRecent: input.useRecent ?? true,
    useQuantity: input.useQuantity ?? true,
    usePrice: input.usePrice ?? true,
    showStoreInList: input.showStoreInList ?? true,
    showPriceInList: input.showPriceInList ?? true,
    itemSortOrder: input.itemSortOrder ?? 'ranked',
    insertPosition: input.insertPosition ?? 'bottom',
    version: 1,
  })

  const now = DateTime.now()
  await ListMember.create({
    listId: list.id,
    userId: input.ownerId,
    role: 'owner',
    invitedAt: now,
    acceptedAt: now,
    sortOrder: await nextListMemberSortOrder(input.ownerId),
  })

  await broadcastSync({
    listId: list.id,
    entityType: 'list',
    entityId: list.id,
    op: 'create',
    version: list.version,
  })

  if (input.seedStarterCategories) {
    await seedStarterCategories(list)
  }

  if (input.seedStarterTodoItems) {
    await seedStarterTodoItems(list, input.ownerId)
  }

  logger.debug(
    {
      listId: list.id,
      ownerId: input.ownerId,
      seededCategories: Boolean(input.seedStarterCategories),
      seededTodoItems: Boolean(input.seedStarterTodoItems),
    },
    'created owned list'
  )

  return list
}
