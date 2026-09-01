import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import env from '#start/env'

// Deliberately not imported at module scope: ace statically imports every
// file under ./commands to build its command list *before* the app finishes
// booting, so a top-level `#models/user` import here would permanently
// capture an unbooted `hash` service binding on the User model class (its
// `withAuthFinder(hash)` mixin closes over whatever `hash` resolves to at
// that early import time) — breaking password hashing for the rest of the
// process, including for unrelated commands/requests that import the same
// cached User module later. Loading everything model-adjacent inside run(),
// after startApp has booted the app, avoids that.

/** Same starter lists a real signup gets — see #controllers/new_account_controller. */
const TODOS_LIST = { name: 'Todos', icon: 'formatListChecks', color: '#1d4ed8' } as const
const STARTER_LIST = { name: 'Shopping List', icon: 'basket', color: '#c2410c' } as const

const MAIN_ACCOUNT = {
  fullName: 'Demo User',
  email: 'demo@example.com',
  password: 'password',
} as const
const SHARING_ACCOUNT = {
  fullName: 'Sharing Demo',
  email: 'sharing@example.com',
  password: 'password',
} as const

/** A read-only-shared list, owned by the sharing account, to demo co-shopping. */
const SHARED_LIST = { name: 'Weekend Camping Trip', icon: 'cart', color: '#15803d' } as const

/**
 * Seeds the two fixed demo/review accounts (`demo@example.com` /
 * `sharing@example.com`, both password `password`) used for app-store
 * review screenshots and manual QA on the public demo instance.
 *
 * Deliberately conservative about when it's allowed to run, since it's
 * wired into every container boot (see docker/root/etc/cont-init.d/35-demo-seed):
 *
 * - No-ops unless `DEMO_SEED_ENABLED=true` is set — the demo instance opts
 *   in explicitly; a real deployment never sets this and gets no behavior
 *   change at all.
 * - No-ops if the `users` table already has *any* row — this only ever
 *   populates a genuinely fresh database (a freshly-provisioned /config
 *   volume), never touches an existing one. That also makes reruns
 *   (container restarts without wiping /config) safely idempotent instead
 *   of duplicating accounts or lists.
 *
 * Run manually with `node ace demo:seed` (respects the same guards).
 */
export default class DemoSeed extends BaseCommand {
  static commandName = 'demo:seed'
  static description =
    'Seed the fixed demo/review accounts (gated by DEMO_SEED_ENABLED + empty database)'

  static options: CommandOptions = { startApp: true }

  async run() {
    if (!env.get('DEMO_SEED_ENABLED', false)) {
      this.logger.info('demo:seed: skipped — DEMO_SEED_ENABLED is not set')
      return
    }

    const { DateTime } = await import('luxon')
    const { default: User } = await import('#models/user')
    const { default: ListMember } = await import('#models/list_member')
    const { default: Item } = await import('#models/item')
    const { createOwnedList } = await import('#services/list_creation')
    const { nextListMemberSortOrder } = await import('#services/list_member_sort')
    const { broadcastSync } = await import('#services/sync_broadcaster')

    const row = await User.query().count('* as total').first()
    const userCount = Number(row?.$extras.total ?? 0)
    if (userCount > 0) {
      this.logger.info(
        `demo:seed: skipped — database already has ${userCount} user(s), only a fresh database is seeded`
      )
      return
    }

    this.logger.info('demo:seed: seeding demo accounts')

    const main = await User.create(MAIN_ACCOUNT)
    const sharing = await User.create(SHARING_ACCOUNT)

    for (const owner of [main, sharing]) {
      await createOwnedList({
        ownerId: owner.id,
        ...TODOS_LIST,
        useCategories: false,
        useShops: false,
        useFavorites: false,
        useRecent: false,
        useQuantity: false,
        usePrice: false,
        seedStarterTodoItems: true,
      })
      await createOwnedList({ ownerId: owner.id, ...STARTER_LIST, seedStarterCategories: true })
    }

    const sharedList = await createOwnedList({ ownerId: sharing.id, ...SHARED_LIST })
    await Item.create({
      listId: sharedList.id,
      createdBy: sharing.id,
      name: 'Tent',
      checked: false,
      sortOrder: 0,
      version: 1,
    })
    await Item.create({
      listId: sharedList.id,
      createdBy: sharing.id,
      name: 'Sleeping bags',
      checked: false,
      sortOrder: 1,
      version: 1,
    })

    const now = DateTime.now()
    await ListMember.create({
      listId: sharedList.id,
      userId: main.id,
      role: 'viewer',
      invitedAt: now,
      acceptedAt: now,
      sortOrder: await nextListMemberSortOrder(main.id),
    })
    await broadcastSync({
      listId: sharedList.id,
      entityType: 'list',
      entityId: sharedList.id,
      op: 'update',
    })

    this.logger.success('demo:seed: seeded demo@example.com and sharing@example.com')
  }
}
