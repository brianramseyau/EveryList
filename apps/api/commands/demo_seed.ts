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
/**
 * The instance's private admin account — created first (below) so it lands on user id 1, the
 * "owner" account AdminUsersController/SetupController hard-code everywhere instead of a
 * role/permission flag. Its password is generated at runtime by `ensureDemoAdminPassword`
 * (never `password` like the two accounts above, which are deliberately public/shared for
 * app-store review screenshots).
 */
const ADMIN_ACCOUNT_EMAIL = 'admin@example.com'

/** A read-only-shared list, owned by the sharing account, to demo co-shopping. */
const SHARED_LIST = { name: 'Weekend Camping Trip', icon: 'cart', color: '#15803d' } as const

/**
 * Seeds a private admin account (user id 1, password generated at runtime — see
 * `ensureDemoAdminPassword`) plus the two fixed demo/review accounts (`demo@example.com` /
 * `sharing@example.com`, both password `password`, ids above the admin's) used for app-store
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
    'Seed a private admin account plus the fixed demo/review accounts (gated by DEMO_SEED_ENABLED + empty database)'

  static options: CommandOptions = { startApp: true }

  async run() {
    if (!env.get('DEMO_SEED_ENABLED', false)) {
      this.logger.info('demo:seed: skipped — DEMO_SEED_ENABLED is not set')
      return
    }

    const { default: db } = await import('@adonisjs/lucid/services/db')
    const { DateTime } = await import('luxon')
    const { default: User } = await import('#models/user')
    const { default: ListMember } = await import('#models/list_member')
    const { default: Item } = await import('#models/item')
    const { createOwnedList, STARTER_LIST, TODOS_LIST } = await import('#services/list_creation')
    const { nextListMemberSortOrder } = await import('#services/list_member_sort')
    const { broadcastSync } = await import('#services/sync_broadcaster')
    const { demoAdminPasswordFilePath, ensureDemoAdminPassword } =
      await import('#services/demo_admin_account')

    const row = await User.query().count('* as total').first()
    const userCount = Number(row?.$extras.total ?? 0)
    if (userCount > 0) {
      this.logger.info(
        `demo:seed: skipped — database already has ${userCount} user(s), only a fresh database is seeded`
      )
      return
    }

    // Read/generated before the transaction: it's a filesystem side effect, not a DB write, and
    // ensureDemoAdminPassword is itself idempotent (reuses the existing file), so there's nothing
    // to roll back if the transaction below fails.
    const adminPassword = ensureDemoAdminPassword()

    this.logger.info('demo:seed: seeding admin + demo accounts')

    // All writes share one transaction: a failure partway through (e.g. the
    // second createOwnedList call) would otherwise leave real user rows
    // behind, and the userCount guard above would then treat that partial
    // state as "already seeded" and refuse to retry on the next boot.
    await db.transaction(async (trx) => {
      // Explicit id: 1 (not just created-first) so this still lands on the "owner" id even if
      // the empty-database guard above is ever satisfied by a users table that was emptied
      // in place rather than a freshly (re)created database file — SQLite's AUTOINCREMENT
      // counter survives a DELETE, so a plain create-first wouldn't necessarily get id 1 there.
      await User.create(
        { id: 1, fullName: 'Admin', email: ADMIN_ACCOUNT_EMAIL, password: adminPassword },
        { client: trx }
      )

      const main = await User.create(MAIN_ACCOUNT, { client: trx })
      const sharing = await User.create(SHARING_ACCOUNT, { client: trx })

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
          client: trx,
        })
        await createOwnedList({
          ownerId: owner.id,
          ...STARTER_LIST,
          seedStarterCategories: true,
          client: trx,
        })
      }

      const sharedList = await createOwnedList({ ownerId: sharing.id, ...SHARED_LIST, client: trx })
      await Item.create(
        {
          listId: sharedList.id,
          createdBy: sharing.id,
          name: 'Tent',
          checked: false,
          sortOrder: 0,
          version: 1,
        },
        { client: trx }
      )
      await Item.create(
        {
          listId: sharedList.id,
          createdBy: sharing.id,
          name: 'Sleeping bags',
          checked: false,
          sortOrder: 1,
          version: 1,
        },
        { client: trx }
      )

      const now = DateTime.now()
      await ListMember.create(
        {
          listId: sharedList.id,
          userId: main.id,
          role: 'viewer',
          invitedAt: now,
          acceptedAt: now,
          sortOrder: await nextListMemberSortOrder(main.id, trx),
        },
        { client: trx }
      )
      await broadcastSync({
        listId: sharedList.id,
        entityType: 'list',
        entityId: sharedList.id,
        op: 'update',
        client: trx,
      })
    })

    this.logger.success(
      `demo:seed: seeded ${ADMIN_ACCOUNT_EMAIL} (password in ${demoAdminPasswordFilePath()}), ` +
        'demo@example.com and sharing@example.com'
    )
  }
}
