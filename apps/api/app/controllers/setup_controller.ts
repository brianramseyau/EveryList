import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import BackupSetting from '#models/backup_setting'
import { setupValidator } from '#validators/setup'
import { createOwnedList } from '#services/list_creation'
import type { HttpContext } from '@adonisjs/core/http'
import type { BackupFrequency, BackupSettingsDto, SetupStatusDto } from '@everylist/shared'
import UserTransformer from '#transformers/user_transformer'

/** Same starter lists a real signup gets — see #controllers/new_account_controller and
 * #commands/user_create, which each keep their own copy of these for the same reason (no
 * shared caller that would justify factoring three call sites down to one). */
const TODOS_LIST = { name: 'Todos', icon: 'formatListChecks', color: '#1d4ed8' } as const
const STARTER_LIST = { name: 'Shopping List', icon: 'basket', color: '#c2410c' } as const

function toSettingsView(setting: BackupSetting): BackupSettingsDto {
  return {
    frequency: setting.frequency as BackupFrequency,
    timeOfDay: setting.timeOfDay,
    retentionCount: setting.retentionCount,
  }
}

/**
 * First-run setup wizard, reachable with no auth on a fresh instance — creates user id 1 (the
 * instance owner) and confirms initial server settings in one step. See BackupSettingsController
 * and AdminUsersController for the same "user id 1 is the owner" convention this app uses
 * everywhere instead of a role/permission flag.
 *
 * Both routes are intentionally public: `status` only reveals whether any user has ever been
 * created (not who), and `store` re-checks that inside its own transaction before doing anything,
 * so it can never run twice.
 *
 * Accepted trade-off: unlike public/invite signup, `store` isn't gated by `PUBLIC_SIGNUP_ENABLED`
 * or any other secret — this is deliberate (the wizard "should show regardless of if public
 * signups are enabled or not"), but it does mean whoever reaches this endpoint first on a freshly
 * deployed, still-unconfigured instance becomes its owner. Same first-run-takeover window as
 * other self-hosted apps' initial setup wizards (e.g. Nextcloud, Ghost); the mitigation is
 * operational, not code — complete setup immediately after deploying, before exposing the
 * instance publicly.
 */
export default class SetupController {
  async status({ response }: HttpContext) {
    const existingUsers = await User.query().limit(1)
    const needsSetup = existingUsers.length === 0
    const defaultBackupSettings = toSettingsView(await BackupSetting.current())

    const body: SetupStatusDto = { needsSetup, defaultBackupSettings }
    return response.ok({ data: body })
  }

  async store(ctx: HttpContext) {
    const { request, response, serialize, logger } = ctx
    const { fullName, email, password, backup } = await request.validateUsing(setupValidator)

    const result = await db.transaction(async (trx) => {
      // Re-checked here (not just relying on the route being unreachable once setup is
      // "done" some other way) since this is the only source of truth for "is setup done" —
      // see status() above. SQLite serializes writers, so this check-then-insert inside one
      // transaction can't race a concurrent call the way it could across two round trips.
      const existingUsers = await User.query({ client: trx }).limit(1)
      if (existingUsers.length > 0) return null

      const user = await User.create({ fullName, email, password }, { client: trx })

      await createOwnedList({
        ownerId: user.id,
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
        ownerId: user.id,
        ...STARTER_LIST,
        seedStarterCategories: true,
        client: trx,
      })

      // Read/create/save the singleton row on the same transaction as the account and its
      // starter lists, so a failure partway rolls everything back together instead of leaving
      // a real account with no confirmed backup schedule.
      const setting = await BackupSetting.current(trx)
      setting.useTransaction(trx).merge(backup)
      await setting.save()

      return { user, setting }
    })

    if (!result) {
      logger.warn('setup rejected: instance already has a user')
      return response.conflict({ message: 'Setup has already been completed' })
    }

    const { user, setting } = result

    // Minting a login token can't run inside the transaction above — DbAccessTokensProvider
    // always writes through its own connection, not an injected client — but by this point the
    // account, starter lists, and backup settings are already durably committed, so a failure
    // here only costs the caller a token (recoverable with a normal login), never a half-set-up
    // instance.
    const token = await User.accessTokens.create(user)

    logger.info({ userId: user.id }, 'completed initial setup')

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
      backup: toSettingsView(setting),
    })
  }
}
