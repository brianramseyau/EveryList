import fs from 'node:fs'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { BackupSettingsStateDto } from '@everylist/shared'
import { backupDirectory, runScheduledBackupIfDue } from '#services/backup_service'
import { bodyData, signupAndGetToken } from './helpers.js'

test.group('Backup settings', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  // Backup files are a real filesystem write, not part of the DB transaction
  // the setup above rolls back — clear them between tests so one test's
  // backup can't leak into another's "no files yet" assertion.
  group.each.setup(() => {
    fs.rmSync(backupDirectory(), { recursive: true, force: true })
  })

  test('defaults to weekly at 03:00, keeping the last 4 backups of each kind', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const show = await client
      .get('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
    show.assertStatus(200)
    const state = bodyData<BackupSettingsStateDto>(show)
    assert.deepEqual(state.settings, {
      frequency: 'weekly',
      timeOfDay: '03:00',
      retentionCount: 4,
    })
    assert.deepEqual(state.files, [])
  })

  test('lists an automatic backup once the scheduler has taken one', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    await runScheduledBackupIfDue()

    const show = await client
      .get('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<BackupSettingsStateDto>(show)
    assert.lengthOf(state.files, 1)
    assert.equal(state.files[0]!.kind, 'automatic')
  })

  test('requires authentication', async ({ client }) => {
    const show = await client.get('/api/v1/backup-settings')
    show.assertStatus(401)
  })

  test('an authenticated user can update the schedule', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
      .json({ frequency: 'weekly', timeOfDay: '04:30', retentionCount: 10 })
    update.assertStatus(200)
    assert.deepEqual(bodyData<BackupSettingsStateDto>(update).settings, {
      frequency: 'weekly',
      timeOfDay: '04:30',
      retentionCount: 10,
    })

    const show = await client
      .get('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
    assert.equal(bodyData<BackupSettingsStateDto>(show).settings.frequency, 'weekly')
  })

  test('rejects an invalid frequency', async ({ client }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
      .json({ frequency: 'hourly', timeOfDay: '03:00', retentionCount: 4 })
    update.assertStatus(422)
  })

  test('rejects a malformed time of day', async ({ client }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
      .json({ frequency: 'daily', timeOfDay: '3am', retentionCount: 4 })
    update.assertStatus(422)
  })

  test('rejects an out-of-range retention count', async ({ client }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${token}`)
      .json({ frequency: 'daily', timeOfDay: '03:00', retentionCount: 0 })
    update.assertStatus(422)
  })

  test('running now takes an immediate manual backup and lists it, without affecting the schedule', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const run = await client
      .post('/api/v1/backup-settings/run')
      .header('Authorization', `Bearer ${token}`)
    run.assertStatus(200)
    const state = bodyData<BackupSettingsStateDto>(run)
    assert.lengthOf(state.files, 1)
    assert.equal(state.files[0]!.kind, 'manual')
    assert.match(state.files[0]!.filename, /^everylist-manual-\d{8}-\d{6}\.sqlite3$/)
    assert.isAbove(state.files[0]!.sizeBytes, 0)

    // A manual run must never affect when the next scheduled backup fires —
    // otherwise running it late in a period could suppress that period's own
    // scheduled backup. Since scheduling is driven off the newest automatic
    // file (there is none yet), a scheduled check right now must still fire.
    const ran = await runScheduledBackupIfDue()
    assert.isTrue(ran)
  })

  test('the schedule is shared across every user, not per-account', async ({ client, assert }) => {
    const tokenA = await signupAndGetToken(client)
    const tokenB = await signupAndGetToken(client)

    await client
      .patch('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${tokenA}`)
      .json({ frequency: 'monthly', timeOfDay: '02:15', retentionCount: 6 })

    const show = await client
      .get('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${tokenB}`)
    assert.deepEqual(bodyData<BackupSettingsStateDto>(show).settings, {
      frequency: 'monthly',
      timeOfDay: '02:15',
      retentionCount: 6,
    })
  })
})
