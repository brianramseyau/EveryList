import { BackupSettingSchema } from '#database/schema'

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

/**
 * Instance-wide backup configuration — a singleton row (id 1), since this
 * app has no per-user admin concept and everyone shares the one SQLite file.
 * `current()` is the only way this row should ever be read/created, so a
 * fresh instance always finds sane defaults instead of a missing row.
 */
export default class BackupSetting extends BackupSettingSchema {
  static async current(): Promise<BackupSetting> {
    return BackupSetting.firstOrCreate(
      { id: 1 },
      // 4 weekly backups, matching the default weekly schedule.
      { id: 1, frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 }
    )
  }
}
