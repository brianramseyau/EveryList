import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import {
  backupDirectory,
  currentPeriodStart,
  isBackupDue,
  lastAutomaticBackupAt,
  listBackups,
  performBackup,
  pruneToCount,
  runManualBackup,
  runScheduledBackupIfDue,
} from '#services/backup_service'
import BackupSetting from '#models/backup_setting'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-backup-test-'))
}

test.group('currentPeriodStart', () => {
  test('daily: before the scheduled time falls back to yesterday', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-22T02:00:00')
    const start = currentPeriodStart('daily', '03:00', now)
    assert.equal(start.toISODate(), '2026-08-21')
    assert.equal(start.toFormat('HH:mm'), '03:00')
  })

  test('daily: at or after the scheduled time uses today', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-22T03:05:00')
    const start = currentPeriodStart('daily', '03:00', now)
    assert.equal(start.toISODate(), '2026-08-22')
  })

  test('weekly: anchors to the most recent Sunday at the scheduled time', ({ assert }) => {
    // 2026-08-22 is a Saturday.
    const now = DateTime.fromISO('2026-08-22T12:00:00')
    const start = currentPeriodStart('weekly', '03:00', now)
    assert.equal(start.weekday, 7)
    assert.isBelow(start.toMillis(), now.toMillis())
  })

  test('weekly: on Sunday before the scheduled time falls back a full week', ({ assert }) => {
    // 2026-08-23 is a Sunday.
    const now = DateTime.fromISO('2026-08-23T01:00:00')
    const start = currentPeriodStart('weekly', '03:00', now)
    assert.equal(start.toISODate(), '2026-08-16')
  })

  test('monthly: before the 1st-of-month scheduled time falls back a month', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-01T02:00:00')
    const start = currentPeriodStart('monthly', '03:00', now)
    assert.equal(start.toISODate(), '2026-07-01')
  })

  test('monthly: after the 1st uses this month', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-15T12:00:00')
    const start = currentPeriodStart('monthly', '03:00', now)
    assert.equal(start.toISODate(), '2026-08-01')
  })
})

test.group('isBackupDue', () => {
  test('is due when no automatic backup has ever run', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-22T03:05:00')
    assert.isTrue(isBackupDue({ frequency: 'daily', timeOfDay: '03:00' }, null, now))
  })

  test('is not due when the schedule was just created and the current period predates it', ({
    assert,
  }) => {
    // 2026-08-22 is a Saturday; a weekly schedule anchored to Sunday 03:00
    // shouldn't fire just because this is the first check ever — it should
    // wait for the Sunday after the schedule was created, not backdate to
    // the most recent (already-elapsed) Sunday.
    const scheduleCreatedAt = DateTime.fromISO('2026-08-22T22:44:00')
    const now = DateTime.fromISO('2026-08-22T22:48:00')
    assert.isFalse(
      isBackupDue({ frequency: 'weekly', timeOfDay: '03:00' }, null, now, scheduleCreatedAt)
    )
  })

  test('is due once the current period starts after the schedule was created', ({ assert }) => {
    const scheduleCreatedAt = DateTime.fromISO('2026-08-22T22:44:00')
    const now = DateTime.fromISO('2026-08-23T03:05:00')
    assert.isTrue(
      isBackupDue({ frequency: 'weekly', timeOfDay: '03:00' }, null, now, scheduleCreatedAt)
    )
  })

  test('is due once the last automatic backup predates the current period', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-22T03:05:00')
    const lastAutomaticAt = DateTime.fromISO('2026-08-21T03:00:00')
    assert.isTrue(isBackupDue({ frequency: 'daily', timeOfDay: '03:00' }, lastAutomaticAt, now))
  })

  test('is not due once an automatic backup already satisfied the current period', ({ assert }) => {
    const now = DateTime.fromISO('2026-08-22T03:05:00')
    const lastAutomaticAt = DateTime.fromISO('2026-08-22T03:00:00')
    assert.isFalse(isBackupDue({ frequency: 'daily', timeOfDay: '03:00' }, lastAutomaticAt, now))
  })
})

test.group('listBackups / pruneToCount', () => {
  test('listBackups returns an empty array when the directory does not exist', ({ assert }) => {
    assert.deepEqual(listBackups(path.join(tempDir(), 'missing')), [])
  })

  test('listBackups only includes recognized automatic/manual filenames, newest first', ({
    assert,
  }) => {
    const dir = tempDir()
    const olderPath = path.join(dir, 'everylist-automatic-20260101-030000.sqlite3')
    const newerPath = path.join(dir, 'everylist-manual-20260201-030000.sqlite3')
    fs.writeFileSync(olderPath, 'a')
    fs.writeFileSync(newerPath, 'b')
    fs.writeFileSync(path.join(dir, 'not-a-backup.txt'), 'c')
    fs.writeFileSync(path.join(dir, 'everylist-20260101-030000.sqlite3'), 'd') // no kind segment
    // mtime resolution can be too coarse to distinguish two writes issued back
    // to back — set it explicitly so the sort-order assertion below is real.
    const older = DateTime.fromISO('2026-01-01T03:00:00').toJSDate()
    const newer = DateTime.fromISO('2026-02-01T03:00:00').toJSDate()
    fs.utimesSync(olderPath, older, older)
    fs.utimesSync(newerPath, newer, newer)

    const files = listBackups(dir)
    assert.sameDeepMembers(
      files.map((file) => ({ filename: file.filename, kind: file.kind })),
      [
        { filename: 'everylist-automatic-20260101-030000.sqlite3', kind: 'automatic' },
        { filename: 'everylist-manual-20260201-030000.sqlite3', kind: 'manual' },
      ]
    )
    assert.equal(files[0]!.filename, 'everylist-manual-20260201-030000.sqlite3')
  })

  test('pruneToCount is a no-op when the directory does not exist', ({ assert }) => {
    assert.doesNotThrows(() => pruneToCount(path.join(tempDir(), 'missing'), 'automatic', 4))
  })

  test('pruneToCount keeps only the newest N of the given kind, leaving the other kind untouched', ({
    assert,
  }) => {
    const dir = tempDir()
    const files = [
      'everylist-automatic-20260101-030000.sqlite3',
      'everylist-automatic-20260108-030000.sqlite3',
      'everylist-automatic-20260115-030000.sqlite3',
      'everylist-manual-20260110-090000.sqlite3',
    ]
    const times = [
      '2026-01-01T03:00:00',
      '2026-01-08T03:00:00',
      '2026-01-15T03:00:00',
      '2026-01-10T09:00:00',
    ]
    for (const [index, filename] of files.entries()) {
      const filePath = path.join(dir, filename)
      fs.writeFileSync(filePath, 'x')
      const time = DateTime.fromISO(times[index]!).toJSDate()
      fs.utimesSync(filePath, time, time)
    }

    pruneToCount(dir, 'automatic', 2)

    const remaining = fs.readdirSync(dir)
    assert.sameMembers(remaining, [
      'everylist-automatic-20260108-030000.sqlite3',
      'everylist-automatic-20260115-030000.sqlite3',
      'everylist-manual-20260110-090000.sqlite3',
    ])
  })
})

test.group('performBackup', () => {
  test('produces a readable copy of the source database', async ({ assert }) => {
    const dir = tempDir()
    const sourcePath = path.join(dir, 'source.sqlite3')
    const source = new Database(sourcePath)
    source.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)')
    source.exec("INSERT INTO widgets (name) VALUES ('gizmo')")
    source.close()

    const backupDir = path.join(dir, 'backups')
    const destination = await performBackup(sourcePath, backupDir, 'automatic')

    assert.isTrue(fs.existsSync(destination))
    assert.match(path.basename(destination), /^everylist-automatic-\d{8}-\d{6}\.sqlite3$/)
    const restored = new Database(destination, { readonly: true })
    const row = restored.prepare('SELECT name FROM widgets').get() as { name: string }
    assert.equal(row.name, 'gizmo')
    restored.close()
  })
})

test.group('runManualBackup / runScheduledBackupIfDue', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  // These calls perform a real backup against the dev/test DB file, a
  // filesystem side effect the DB transaction rollback above doesn't touch —
  // clear it between tests to keep them independent.
  group.each.setup(() => {
    fs.rmSync(backupDirectory(), { recursive: true, force: true })
  })

  test('runManualBackup writes a manual-kind file and never an automatic one', async ({
    assert,
  }) => {
    const setting = await BackupSetting.current()
    setting.retentionCount = 4
    await setting.save()

    const destination = await runManualBackup()

    assert.match(path.basename(destination), /^everylist-manual-\d{8}-\d{6}\.sqlite3$/)
    assert.isNull(lastAutomaticBackupAt(backupDirectory()))
  })

  test('a manual backup does not suppress a scheduled backup that becomes due afterward', async ({
    assert,
  }) => {
    const setting = await BackupSetting.current()
    setting.frequency = 'daily'
    setting.timeOfDay = '03:00'
    setting.createdAt = DateTime.fromISO('2026-08-01T00:00:00')
    await setting.save()

    // Runs late in the previous period — if this incorrectly counted as an
    // automatic backup, it would satisfy the next period too and the
    // scheduler below would wrongly skip it.
    await runManualBackup()

    const ran = await runScheduledBackupIfDue(DateTime.fromISO('2026-08-22T03:05:00'))
    assert.isTrue(ran)
  })

  test('runScheduledBackupIfDue takes a backup when due and reports true', async ({ assert }) => {
    const setting = await BackupSetting.current()
    setting.frequency = 'daily'
    setting.timeOfDay = '03:00'
    setting.createdAt = DateTime.fromISO('2026-08-01T00:00:00')
    await setting.save()

    const now = DateTime.fromISO('2026-08-22T03:05:00')
    const ran = await runScheduledBackupIfDue(now)
    assert.isTrue(ran)
    assert.isTrue(lastAutomaticBackupAt(backupDirectory())!.equals(now))
  })

  test('runScheduledBackupIfDue is a no-op when not due and reports false', async ({ assert }) => {
    const now = DateTime.fromISO('2026-08-22T03:05:00')
    const setting = await BackupSetting.current()
    setting.frequency = 'daily'
    setting.timeOfDay = '03:00'
    setting.createdAt = DateTime.fromISO('2026-08-01T00:00:00')
    await setting.save()

    await runScheduledBackupIfDue(now)
    const ran = await runScheduledBackupIfDue(now)
    assert.isFalse(ran)
  })

  test('runScheduledBackupIfDue prunes automatic backups to the configured count', async ({
    assert,
  }) => {
    const setting = await BackupSetting.current()
    setting.frequency = 'daily'
    setting.timeOfDay = '03:00'
    setting.retentionCount = 2
    setting.createdAt = DateTime.fromISO('2026-08-01T00:00:00')
    await setting.save()

    await runScheduledBackupIfDue(DateTime.fromISO('2026-08-20T03:00:00'))
    await runScheduledBackupIfDue(DateTime.fromISO('2026-08-21T03:00:00'))
    await runScheduledBackupIfDue(DateTime.fromISO('2026-08-22T03:00:00'))

    assert.lengthOf(listBackups(backupDirectory()), 2)
  })
})
