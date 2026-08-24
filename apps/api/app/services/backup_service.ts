import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import BackupSetting, { type BackupFrequency } from '#models/backup_setting'

export type BackupKind = 'automatic' | 'manual'

const FILE_PREFIX = 'everylist-'
const FILE_SUFFIX = '.sqlite3'
const FILENAME_PATTERN = /^everylist-(automatic|manual)-\d{8}-\d{6}\.sqlite3$/

/** Same env var/default `config/database.ts` resolves the live DB file from. */
export function databaseFilename(): string {
  return env.get('DATABASE_FILENAME', app.tmpPath('db.sqlite3'))
}

/** Backups live next to the database file — under `/config/backups` in prod, no
 * separate volume to mount. */
export function backupDirectory(): string {
  return path.join(path.dirname(databaseFilename()), 'backups')
}

export interface BackupFileInfo {
  filename: string
  kind: BackupKind
  sizeBytes: number
  createdAt: string
}

function parseBackupFilename(filename: string): BackupKind | null {
  const match = FILENAME_PATTERN.exec(filename)
  return match ? (match[1] as BackupKind) : null
}

export function listBackups(backupDir: string): BackupFileInfo[] {
  if (!fs.existsSync(backupDir)) return []

  return fs
    .readdirSync(backupDir)
    .flatMap((entry) => {
      const kind = parseBackupFilename(entry)
      if (!kind) return []

      const stat = fs.statSync(path.join(backupDir, entry))
      return [
        {
          filename: entry,
          kind,
          sizeBytes: stat.size,
          createdAt: DateTime.fromJSDate(stat.mtime).toISO()!,
        },
      ]
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Keeps only the newest `count` backups of `kind`, deleting the rest.
 * Automatic and manual backups are pruned independently — they're
 * deliberately decoupled processes (see `runManualBackup`), so "keep N"
 * means N of each, not N combined. Pruning by count rather than by age also
 * guarantees the newest backup of a kind is never at risk of being pruned
 * away before the next due-check reads it (see `lastAutomaticBackupAt`).
 */
export function pruneToCount(backupDir: string, kind: BackupKind, count: number): void {
  if (!fs.existsSync(backupDir)) return

  const matching = listBackups(backupDir).filter((file) => file.kind === kind)
  const toDelete = matching.slice(count)
  if (toDelete.length === 0) return

  logger.debug(
    { kind, count, deleting: toDelete.map((file) => file.filename) },
    'pruning old backups'
  )
  for (const file of toDelete) {
    fs.unlinkSync(path.join(backupDir, file.filename))
  }
}

/**
 * Uses better-sqlite3's native online backup API (rather than copying the file)
 * so a backup can be taken safely while the app is live and writing — it
 * correctly captures a consistent snapshot under WAL mode without blocking or
 * corrupting concurrent writers, unlike a plain file copy of the `.sqlite3`/
 * `-wal`/`-shm` triplet.
 */
export async function performBackup(
  dbFilename: string,
  backupDir: string,
  kind: BackupKind,
  now: DateTime = DateTime.now()
): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = now.toFormat('yyyyLLdd-HHmmss')
  const destination = path.join(backupDir, `${FILE_PREFIX}${kind}-${timestamp}${FILE_SUFFIX}`)

  const source = new Database(dbFilename, { readonly: true })
  try {
    await source.backup(destination)
  } catch (error) {
    logger.error({ err: error, kind, destination }, 'database backup failed')
    throw error
  } finally {
    source.close()
  }

  // `listBackups`/`lastAutomaticBackupAt` read a file's timestamp off its
  // mtime, which otherwise reflects real wall-clock write time rather than
  // the logical `now` this backup was taken for — pin it explicitly so the
  // two always agree, matching what the filename already encodes.
  const timestampDate = now.toJSDate()
  fs.utimesSync(destination, timestampDate, timestampDate)

  logger.info(
    { kind, destination, sizeBytes: fs.statSync(destination).size },
    'database backup completed'
  )
  return destination
}

/**
 * The start of the current scheduling period as of `now` — e.g. for a daily
 * 3am schedule checked at 3:04am, this is today at 3:00am; checked at 2:00am
 * it's yesterday's 3:00am. Weekly anchors to Sunday, monthly to the 1st.
 */
export function currentPeriodStart(
  frequency: BackupFrequency,
  timeOfDay: string,
  now: DateTime
): DateTime {
  const [hour, minute] = timeOfDay.split(':').map(Number)

  if (frequency === 'daily') {
    const candidate = now.set({ hour, minute, second: 0, millisecond: 0 })
    return candidate > now ? candidate.minus({ days: 1 }) : candidate
  }

  if (frequency === 'weekly') {
    // Luxon weekday: 1 = Monday ... 7 = Sunday. Anchored on Sunday.
    const today = now.set({ hour, minute, second: 0, millisecond: 0 })
    const daysSinceSunday = today.weekday % 7
    const candidate = today.minus({ days: daysSinceSunday })
    return candidate > now ? candidate.minus({ weeks: 1 }) : candidate
  }

  const candidate = now.set({ day: 1, hour, minute, second: 0, millisecond: 0 })
  return candidate > now ? candidate.minus({ months: 1 }) : candidate
}

/**
 * The most recent automatic backup's timestamp, or null if none exist yet —
 * read straight off disk rather than tracked in a separate column, so it can
 * never drift from what's actually there. Only ever looks at `automatic`
 * files: a manual "back up now" must never satisfy the schedule (see
 * `runManualBackup`).
 */
export function lastAutomaticBackupAt(backupDir: string): DateTime | null {
  const [latest] = listBackups(backupDir).filter((file) => file.kind === 'automatic')
  return latest ? DateTime.fromISO(latest.createdAt) : null
}

/** Due at most once per period: fires as soon as `now` reaches the period's
 * scheduled time, and stays "not due" once the last automatic backup catches
 * up to it. If no automatic backup has ever run, waits for the first period
 * boundary *after* the schedule was created rather than backdating to
 * whatever the current period's start happens to be — otherwise a schedule
 * that's only just been created (e.g. this instance's first-ever startup)
 * would see a stale, already-elapsed period as "due" and fire immediately,
 * however far that is from the configured time-of-day. */
export function isBackupDue(
  schedule: { frequency: BackupFrequency; timeOfDay: string },
  lastAutomaticAt: DateTime | null,
  now: DateTime,
  scheduleCreatedAt: DateTime | null = null
): boolean {
  const periodStart = currentPeriodStart(schedule.frequency, schedule.timeOfDay, now)
  if (lastAutomaticAt) return lastAutomaticAt < periodStart
  return !scheduleCreatedAt || periodStart >= scheduleCreatedAt
}

/**
 * Takes a backup on demand, outside the schedule — writes a `manual`-kind
 * file and prunes only among other manual backups. An operator hitting
 * "back up now" shouldn't change when the *next* scheduled backup fires, or
 * suppress it: since scheduling is driven entirely by the newest
 * `automatic`-kind file on disk (see `lastAutomaticBackupAt`), a manual run
 * never touches that file and so can never affect it.
 */
export async function runManualBackup(): Promise<string> {
  logger.debug('manual backup requested')
  const settings = await BackupSetting.current()
  const backupDir = backupDirectory()

  const destination = await performBackup(databaseFilename(), backupDir, 'manual')
  pruneToCount(backupDir, 'manual', settings.retentionCount)

  return destination
}

/** Checked periodically by the scheduler — only takes a backup when the
 * current schedule is actually due, and is the only path that ever writes
 * an `automatic`-kind file. */
export async function runScheduledBackupIfDue(now: DateTime = DateTime.now()): Promise<boolean> {
  const settings = await BackupSetting.current()
  const backupDir = backupDirectory()

  const lastAt = lastAutomaticBackupAt(backupDir)
  const due = isBackupDue(
    { frequency: settings.frequency as BackupFrequency, timeOfDay: settings.timeOfDay },
    lastAt,
    now,
    settings.createdAt
  )
  logger.debug(
    { due, frequency: settings.frequency, timeOfDay: settings.timeOfDay, lastAt, now },
    'scheduled backup due-check'
  )
  if (!due) return false

  await performBackup(databaseFilename(), backupDir, 'automatic', now)
  pruneToCount(backupDir, 'automatic', settings.retentionCount)

  return true
}
