import fs from 'node:fs'
import { test } from '@japa/runner'
import { demoAdminPasswordFilePath, ensureDemoAdminPassword } from '#services/demo_admin_account'

test.group('Demo admin password', (group) => {
  // Real filesystem write, next to the test DB file — not part of any DB transaction, so clean
  // it up explicitly between tests (same pattern as server_config.spec.ts's config.yaml cleanup).
  group.each.setup(() => {
    const filePath = demoAdminPasswordFilePath()
    return () => fs.rmSync(filePath, { force: true })
  })

  test('generates and persists a password on first call', ({ assert }) => {
    const filePath = demoAdminPasswordFilePath()
    assert.isFalse(fs.existsSync(filePath))

    const password = ensureDemoAdminPassword()

    assert.isTrue(fs.existsSync(filePath))
    assert.isAtLeast(password.length, 8)
    assert.isAtMost(password.length, 32)
    assert.equal(fs.readFileSync(filePath, 'utf8').trim(), password)
  })

  test('reuses the persisted password on subsequent calls instead of regenerating', ({
    assert,
  }) => {
    const first = ensureDemoAdminPassword()
    const second = ensureDemoAdminPassword()

    assert.equal(first, second)
  })

  test('reads back a password left over from a previous process/boot', ({ assert }) => {
    const filePath = demoAdminPasswordFilePath()
    fs.writeFileSync(filePath, 'existing-password\n', { mode: 0o600 })

    assert.equal(ensureDemoAdminPassword(), 'existing-password')
  })

  test('writes the file with owner-only permissions', ({ assert }) => {
    ensureDemoAdminPassword()

    const mode = fs.statSync(demoAdminPasswordFilePath()).mode & 0o777
    assert.equal(mode, 0o600)
  })
})
