import path from 'node:path'
import type User from '#models/user'
import BackupSetting from '#models/backup_setting'
import { updateBackupSettingValidator } from '#validators/backup_setting'
import {
  backupDirectory,
  isBackupFilename,
  listBackups,
  runManualBackup,
} from '#services/backup_service'
import type { HttpContext } from '@adonisjs/core/http'
import type { BackupFrequency, BackupSettingsDto, BackupSettingsStateDto } from '@everylist/shared'

function toSettingsView(setting: BackupSetting): BackupSettingsDto {
  return {
    frequency: setting.frequency as BackupFrequency,
    timeOfDay: setting.timeOfDay,
    retentionCount: setting.retentionCount,
  }
}

function toState(setting: BackupSetting): BackupSettingsStateDto {
  return {
    settings: toSettingsView(setting),
    files: listBackups(backupDirectory()),
  }
}

/**
 * Backups expose the raw database file, unlike the shared schedule settings around them — see
 * routes.ts's backup-settings comment for why the schedule itself stays open to any authenticated
 * user. There's no admin role in this app, so same as admin_users_controller.ts and
 * debug_controller.ts, this hard-codes the caller to user id 1 rather than a role/permission flag
 * that could be granted away by mistake.
 */
export default class BackupSettingsController {
  private requireAdmin({ auth, response, logger }: HttpContext): User | null {
    const user = auth.getUserOrFail()
    if (user.id !== 1) {
      logger.warn({ userId: user.id }, 'backup admin endpoint access denied')
      response.forbidden({ message: 'Not authorized' })
      return null
    }
    return user
  }

  async show(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const setting = await BackupSetting.current()
    return ctx.response.ok({ data: toState(setting) })
  }

  async update(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const { request, response, logger } = ctx
    const payload = await request.validateUsing(updateBackupSettingValidator)
    const setting = await BackupSetting.current()
    setting.merge(payload)
    await setting.save()

    logger.debug(
      {
        frequency: setting.frequency,
        timeOfDay: setting.timeOfDay,
        retentionCount: setting.retentionCount,
      },
      'updated backup settings'
    )

    return response.ok({ data: toState(setting) })
  }

  /** Takes an immediate backup outside the schedule — writes a `manual`-kind
   * file, which never affects the next scheduled run (see runManualBackup). */
  async run(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const { response, logger } = ctx
    logger.debug('starting manual backup')
    await runManualBackup()
    const setting = await BackupSetting.current()
    const state = toState(setting)

    logger.debug({ fileCount: state.files.length }, 'manual backup completed')

    return response.ok({ data: state })
  }

  /** Streams a single backup file down for download. `filename` is validated against the exact
   * pattern `performBackup` produces before it's joined onto `backupDirectory()` — this is a
   * user-supplied path segment and the only thing standing between it and traversal outside that
   * directory. */
  async download(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const { request, response, logger } = ctx

    const filename = request.param('filename') as string
    if (!isBackupFilename(filename)) {
      return response.badRequest({ message: 'Invalid backup filename' })
    }

    const filePath = path.join(backupDirectory(), filename)
    logger.info({ filename }, 'admin downloaded backup file')
    return response.attachment(filePath, filename)
  }
}
