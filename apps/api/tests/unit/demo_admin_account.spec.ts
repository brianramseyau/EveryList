import fs from 'node:fs'
import path from 'node:path'
import { test } from '@japa/runner'
import { demoAdminPasswordFilePath, ensureDemoAdminPassword } from '#services/demo_admin_account'

test.group('Demo admin password', (group) => {
  // Real filesystem write, next to the test DB file — not part of any DB transaction, so clean
  // it up explicitly between tests (same pattern as server_config.spec.ts's config.yaml cleanup).
  group.each.setup(() => {
    const filePath = demoAdminPasswordFilePath()
    const originalWriteFileSync = fs.writeFileSync
    const originalLinkSync = fs.linkSync
    return () => {
      fs.writeFileSync = originalWriteFileSync
      fs.linkSync = originalLinkSync
      fs.rmSync(filePath, { force: true })
      // Temp files are named `<filePath>.<pid>.<random>.tmp` — sweep any a failed/interrupted
      // test left behind so it can't leak into a later test's directory listing.
      const dir = path.dirname(filePath)
      const prefix = `${path.basename(filePath)}.`
      for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith(prefix) && entry.endsWith('.tmp')) {
          fs.rmSync(path.join(dir, entry), { force: true })
        }
      }
    }
  })

  test('generates and persists a password on first call', ({ assert }) => {
    const filePath = demoAdminPasswordFilePath()
    assert.isFalse(fs.existsSync(filePath))

    const password = ensureDemoAdminPassword()

    assert.isTrue(fs.existsSync(filePath))
    assert.isAtLeast(password.length, 8)
    assert.isAtMost(password.length, 32)
    // Never the demo/sharing accounts' fixed, publicly documented password.
    assert.notEqual(password, 'password')
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

  test('tightens a pre-existing file left at looser permissions', ({ assert }) => {
    const filePath = demoAdminPasswordFilePath()
    fs.writeFileSync(filePath, 'existing-password\n', { mode: 0o644 })

    ensureDemoAdminPassword()

    const mode = fs.statSync(filePath).mode & 0o777
    assert.equal(mode, 0o600)
  })

  test('reads back the winning password when it loses a concurrent create race', ({ assert }) => {
    const filePath = demoAdminPasswordFilePath()
    const originalLinkSync = fs.linkSync

    // Simulates a second demo:seed process publishing the file between our existsSync check and
    // our own link — the call below should fall back to reading whatever that process published,
    // instead of returning its own now-orphaned password.
    fs.linkSync = (() => {
      fs.linkSync = originalLinkSync
      fs.writeFileSync(filePath, 'winning-password\n', { mode: 0o600 })
      const error = new Error('EEXIST') as NodeJS.ErrnoException
      error.code = 'EEXIST'
      throw error
    }) as typeof fs.linkSync

    assert.equal(ensureDemoAdminPassword(), 'winning-password')
  })

  test('rethrows an unexpected write failure instead of masking it', ({ assert }) => {
    fs.writeFileSync = (() => {
      throw new Error('disk full')
    }) as typeof fs.writeFileSync

    assert.throws(() => ensureDemoAdminPassword(), 'disk full')
  })

  test('cleans up the temporary file after a successful publish', ({ assert }) => {
    const filePath = demoAdminPasswordFilePath()

    ensureDemoAdminPassword()

    const dir = path.dirname(filePath)
    const leftoverTmpFiles = fs
      .readdirSync(dir)
      .filter((entry) => entry.startsWith(`${path.basename(filePath)}.`) && entry.endsWith('.tmp'))
    assert.deepEqual(leftoverTmpFiles, [])
  })
})
