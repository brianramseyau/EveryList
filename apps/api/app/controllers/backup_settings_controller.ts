import BackupSetting from '#models/backup_setting'
import { updateBackupSettingValidator } from '#validators/backup_setting'
import { backupDirectory, listBackups, runManualBackup } from '#services/backup_service'
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

export default class BackupSettingsController {
  async show({ response }: HttpContext) {
    const setting = await BackupSetting.current()
    return response.ok({ data: toState(setting) })
  }

  async update({ request, response, logger }: HttpContext) {
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
  async run({ response, logger }: HttpContext) {
    logger.debug('starting manual backup')
    await runManualBackup()
    const setting = await BackupSetting.current()
    const state = toState(setting)

    logger.debug({ fileCount: state.files.length }, 'manual backup completed')

    return response.ok({ data: state })
  }
}
