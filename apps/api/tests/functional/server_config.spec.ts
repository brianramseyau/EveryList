import fs from 'node:fs'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ServerConfigStateDto } from '@everylist/shared'
import { loadFileCache, serverConfigValue, serverConfigYamlPath } from '#services/server_config'
import { smtpTransportConfig } from '#config/mail'
import { bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

test.group('Server config', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  // config.yaml is a real filesystem write, not part of the DB transaction the setup above rolls
  // back — clear it (and any permission change a test made) between tests, same as
  // backup_settings.spec.ts does for backup files. The in-memory file cache (server_config.ts's
  // `fileCache`) is a module-level singleton that outlives any one test, so it's reloaded from
  // disk on both sides too — otherwise it would keep serving a previous test's values (or this
  // whole file's) into whatever spec runs next in the same process.
  group.each.setup(() => {
    const filePath = serverConfigYamlPath()
    return () => {
      if (fs.existsSync(filePath)) {
        fs.chmodSync(filePath, 0o644)
        fs.rmSync(filePath, { recursive: true, force: true })
      }
      loadFileCache()
    }
  })
  // meta.spec.ts/auth.spec.ts use `env.set('PUBLIC_SIGNUP_ENABLED', ...)` to toggle it for their
  // own tests — being a real AdonisJS `Env` instance, that also writes through to `process.env`
  // (see @adonisjs/env's `Env#set`) and can leave it set for the rest of the process. Several
  // tests below assert this file's exact resolved source/value for PUBLIC_SIGNUP_ENABLED and
  // SMTP2GO_PORT, so both are unset here regardless of what ran before this group.
  group.each.setup(() => {
    const original = {
      publicSignupEnabled: process.env.PUBLIC_SIGNUP_ENABLED,
      smtp2goPort: process.env.SMTP2GO_PORT,
    }
    delete process.env.PUBLIC_SIGNUP_ENABLED
    delete process.env.SMTP2GO_PORT
    return () => {
      if (original.publicSignupEnabled === undefined) delete process.env.PUBLIC_SIGNUP_ENABLED
      else process.env.PUBLIC_SIGNUP_ENABLED = original.publicSignupEnabled
      if (original.smtp2goPort === undefined) delete process.env.SMTP2GO_PORT
      else process.env.SMTP2GO_PORT = original.smtp2goPort
    }
  })

  test('requires authentication', async ({ client }) => {
    const show = await client.get('/api/v1/server-config')
    show.assertStatus(401)

    const update = await client.patch('/api/v1/server-config')
    update.assertStatus(401)
  })

  test('forbids any user other than id 1', async ({ client, assert }) => {
    const admin = await signupAndGetUser(client)
    assert.equal(admin.id, 1)
    const other = await signupAndGetUser(client)
    assert.notEqual(other.id, 1)

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${other.token}`)
    show.assertStatus(403)

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ mailHost: 'evil.example.com' })
    update.assertStatus(403)
  })

  test('admin GET returns defaults with no config.yaml on disk', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    show.assertStatus(200)

    const state = bodyData<ServerConfigStateDto>(show)
    assert.isTrue(state.writable)
    assert.equal(state.mailHost.source, 'default')
    assert.isFalse(state.mailPassword.isSet)
  })

  test('PATCH persists a setting across a fresh GET', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailHost: 'mail.example.com', mailPort: 587 })
    update.assertStatus(200)
    const updated = bodyData<ServerConfigStateDto>(update)
    assert.equal(updated.mailHost.value, 'mail.example.com')
    assert.equal(updated.mailHost.source, 'file')
    assert.equal(updated.mailPort.value, 587)

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.mailHost.value, 'mail.example.com')
    assert.equal(state.mailPort.value, 587)

    // The file-set value is picked up with no restart — see server_config.ts's applyMailConfig.
    assert.equal(smtpTransportConfig.host, 'mail.example.com')
    assert.equal(smtpTransportConfig.port, 587)
  })

  test('a secret field omitted from the PATCH body is left unchanged', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailPassword: 'hunter2' })

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailHost: 'mail.example.com' })
    const state = bodyData<ServerConfigStateDto>(update)
    assert.isTrue(state.mailPassword.isSet)
    assert.isNull(state.mailPassword.value)
  })

  test('rejects updating a field currently set via an environment variable', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const original = process.env.SMTP2GO_HOST
    process.env.SMTP2GO_HOST = 'locked.example.com'
    try {
      const update = await client
        .patch('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
        .json({ mailHost: 'attempted-override.example.com' })
      update.assertStatus(400)

      const show = await client
        .get('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
      const state = bodyData<ServerConfigStateDto>(show)
      assert.equal(state.mailHost.source, 'env')
      assert.equal(state.mailHost.value, 'locked.example.com')
    } finally {
      if (original === undefined) delete process.env.SMTP2GO_HOST
      else process.env.SMTP2GO_HOST = original
    }
  })

  test('rejects a write when config.yaml is not writable', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    // Create the file first (so there's something to chmod), then make it read-only —
    // simulating a read-only mount without touching the shared tmp/ directory's own
    // permissions, which other concurrently-running tests write into.
    await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailHost: 'mail.example.com' })

    fs.chmodSync(serverConfigYamlPath(), 0o444)
    try {
      const update = await client
        .patch('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
        .json({ mailHost: 'changed.example.com' })
      update.assertStatus(403)

      const show = await client
        .get('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
      assert.isFalse(bodyData<ServerConfigStateDto>(show).writable)
    } finally {
      fs.chmodSync(serverConfigYamlPath(), 0o644)
    }
  })

  test('rejects an invalid app URL', async ({ client }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ appUrl: 'not-a-url' })
    update.assertStatus(422)
  })

  test('persists a top-level (non-nested) setting', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ publicSignupEnabled: false })
    const state = bodyData<ServerConfigStateDto>(update)
    assert.equal(state.publicSignupEnabled.value, false)
    assert.equal(state.publicSignupEnabled.source, 'file')

    const meta = await client.get('/api/v1/meta')
    assert.isFalse(meta.body().publicSignupEnabled)
  })

  test('ignores an unparseable env value for a boolean/number setting, falling back to file/default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const originalEnabled = process.env.PUBLIC_SIGNUP_ENABLED
    const originalPort = process.env.SMTP2GO_PORT
    process.env.PUBLIC_SIGNUP_ENABLED = 'sure'
    process.env.SMTP2GO_PORT = 'not-a-number'
    try {
      const show = await client
        .get('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
      const state = bodyData<ServerConfigStateDto>(show)
      assert.equal(state.publicSignupEnabled.source, 'default')
      assert.equal(state.mailPort.source, 'default')
    } finally {
      if (originalEnabled === undefined) delete process.env.PUBLIC_SIGNUP_ENABLED
      else process.env.PUBLIC_SIGNUP_ENABLED = originalEnabled
      if (originalPort === undefined) delete process.env.SMTP2GO_PORT
      else process.env.SMTP2GO_PORT = originalPort
    }
  })

  test('ignores malformed YAML already on disk instead of crashing', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(serverConfigYamlPath(), '{ not: valid: yaml', 'utf8')

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailHost: 'mail.example.com' })
    update.assertStatus(200)
    assert.equal(bodyData<ServerConfigStateDto>(update).mailHost.value, 'mail.example.com')
  })

  test('serverConfigValue throws for a key with no matching setting', ({ assert }) => {
    assert.throws(
      () => serverConfigValue('NOT_A_REAL_SETTING', 'fallback'),
      'Unknown server-config setting: NOT_A_REAL_SETTING'
    )
  })

  test('reads a valid numeric env value straight through', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const original = process.env.SMTP2GO_PORT
    process.env.SMTP2GO_PORT = '2525'
    try {
      const show = await client
        .get('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
      const state = bodyData<ServerConfigStateDto>(show)
      assert.equal(state.mailPort.value, 2525)
      assert.equal(state.mailPort.source, 'env')
    } finally {
      if (original === undefined) delete process.env.SMTP2GO_PORT
      else process.env.SMTP2GO_PORT = original
    }
  })

  test('ignores a config.yaml whose top-level content is not an object', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(serverConfigYamlPath(), 'just a string\n', 'utf8')

    const update = await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailHost: 'mail.example.com' })
    update.assertStatus(200)
    assert.equal(bodyData<ServerConfigStateDto>(update).mailHost.value, 'mail.example.com')
  })

  test('rejects a write that fails despite the writability pre-check, without leaking the attempted value into memory', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // A directory at the config path passes the access() writability pre-check (you can create
    // files inside a writable directory) but fails the real write with EISDIR — a stand-in for
    // any mount quirk access() can't predict, exercising updateServerConfig's write-time catch.
    const filePath = serverConfigYamlPath()
    fs.mkdirSync(filePath)
    try {
      const update = await client
        .patch('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
        .json({ mailHost: 'mail.example.com' })
      update.assertStatus(403)

      // The attempted value must never appear as if it were live — updateServerConfig applies a
      // patch to a clone and only commits it to the shared in-memory cache after a successful
      // write, so a failed write leaves every call site (this GET included) still resolving the
      // pre-attempt state, not a value that was never actually persisted.
      const show = await client
        .get('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
      const state = bodyData<ServerConfigStateDto>(show)
      assert.equal(state.mailHost.source, 'default')
      assert.isNull(state.mailHost.value)
    } finally {
      fs.rmdirSync(filePath)
    }
  })

  test('writes config.yaml with 0600 permissions, even over an existing looser-permissioned file', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const filePath = serverConfigYamlPath()

    // Simulate a file that predates this permission tightening (or was hand-created with
    // default umask) — the fix must re-tighten it on every write, not just at creation.
    fs.writeFileSync(filePath, 'mail: {}\n', { mode: 0o644 })
    loadFileCache()

    await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
      .json({ mailHost: 'mail.example.com' })

    const mode = fs.statSync(filePath).mode & 0o777
    assert.equal(mode, 0o600)
  })

  test('still commits a successful write even when tightening its permissions afterward fails', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // Some mounts accept writes but reject chmod (e.g. certain network/Windows binds) — the write
    // itself must still count as having succeeded rather than reporting 403 for a change that's
    // actually already on disk. fs.chmodSync is monkey-patched for this one call only, restored
    // immediately after.
    const originalChmodSync = fs.chmodSync
    fs.chmodSync = () => {
      throw new Error('EPERM: operation not permitted, chmod')
    }
    try {
      const update = await client
        .patch('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
        .json({ mailHost: 'mail.example.com' })
      update.assertStatus(200)
      assert.equal(bodyData<ServerConfigStateDto>(update).mailHost.value, 'mail.example.com')
    } finally {
      fs.chmodSync = originalChmodSync
    }

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    assert.equal(bodyData<ServerConfigStateDto>(show).mailHost.value, 'mail.example.com')
  })

  test('coerces a quoted "false"/"true" string in config.yaml into a real boolean, not a truthy string', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // A hand-edited file quoting a boolean turns it into a YAML string — without coercion, that
    // string would resolve as a *truthy* value wherever it's read as a boolean (`Boolean('false')`
    // is `true`), silently flipping the setting's meaning. server_config.ts's coerceFileValue
    // parses recognizable boolean strings explicitly instead of passing the raw string through.
    fs.writeFileSync(serverConfigYamlPath(), "publicSignupEnabled: 'false'\n", 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.publicSignupEnabled.source, 'file')
    assert.equal(state.publicSignupEnabled.value, false)
  })

  test('ignores an unparsable boolean/number value in a hand-edited config.yaml, falling back to default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(
      serverConfigYamlPath(),
      "publicSignupEnabled: 'maybe'\nmail:\n  port: 'not-a-port'\n",
      'utf8'
    )
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.publicSignupEnabled.source, 'default')
    assert.equal(state.publicSignupEnabled.value, null)
    assert.equal(state.mailPort.source, 'default')
    assert.equal(state.mailPort.value, null)
  })

  test('ignores a YAML .nan/.inf literal for a numeric setting, falling back to default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // YAML's `.nan`/`.inf` scalars parse straight to the JS number NaN/Infinity — genuinely
    // `number`-typed values that still aren't a usable port, so coerceFileValue rejects both
    // explicitly (Number.isFinite, not just Number.isNaN) rather than letting either flow into
    // smtpTransportConfig.port.
    fs.writeFileSync(serverConfigYamlPath(), 'mail:\n  port: .inf\n', 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.mailPort.source, 'default')
    assert.equal(state.mailPort.value, null)
  })

  test('ignores an "Infinity"/whitespace-only numeric string in config.yaml, falling back to default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // Number('Infinity') and Number('  ') both succeed (Infinity and 0 respectively) without a
    // finiteness/blank check — quoting either in a hand-edited file must not silently produce a
    // usable-looking port.
    fs.writeFileSync(serverConfigYamlPath(), "mail:\n  port: 'Infinity'\n", 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.mailPort.source, 'default')
    assert.equal(state.mailPort.value, null)
  })

  test('coerces a numeric YAML 0/1 for a boolean setting instead of falling back to default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // An unquoted `publicSignupEnabled: 0` parses as the YAML number 0, not a string — before the
    // fix, coerceFileValue only accepted boolean/string raw values, so this fell through to
    // "unset" and silently resolved to the default (true), re-enabling signups a hand-edited file
    // meant to disable.
    fs.writeFileSync(serverConfigYamlPath(), 'publicSignupEnabled: 0\n', 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.publicSignupEnabled.source, 'file')
    assert.equal(state.publicSignupEnabled.value, false)
  })

  test('coerces a numeric YAML 1 for a boolean setting to true', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(serverConfigYamlPath(), 'publicSignupEnabled: 1\n', 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.publicSignupEnabled.source, 'file')
    assert.equal(state.publicSignupEnabled.value, true)
  })

  test('ignores a numeric YAML value that is neither 0 nor 1 for a boolean setting', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(serverConfigYamlPath(), 'publicSignupEnabled: 2\n', 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.publicSignupEnabled.source, 'default')
    assert.equal(state.publicSignupEnabled.value, null)
  })

  test('ignores a whitespace-only quoted numeric value in config.yaml, falling back to default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(serverConfigYamlPath(), "mail:\n  port: '   '\n", 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.mailPort.source, 'default')
    assert.equal(state.mailPort.value, null)
  })

  test('ignores a whitespace-only SMTP2GO_PORT env var, falling back to file/default', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const original = process.env.SMTP2GO_PORT
    process.env.SMTP2GO_PORT = '   '
    try {
      const show = await client
        .get('/api/v1/server-config')
        .header('Authorization', `Bearer ${token}`)
      const state = bodyData<ServerConfigStateDto>(show)
      assert.equal(state.mailPort.source, 'default')
      assert.equal(state.mailPort.value, null)
    } finally {
      if (original === undefined) delete process.env.SMTP2GO_PORT
      else process.env.SMTP2GO_PORT = original
    }
  })

  test('coerces a quoted numeric string in config.yaml into a real number', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    fs.writeFileSync(serverConfigYamlPath(), "mail:\n  port: '2525'\n", 'utf8')
    loadFileCache()

    const show = await client
      .get('/api/v1/server-config')
      .header('Authorization', `Bearer ${token}`)
    const state = bodyData<ServerConfigStateDto>(show)
    assert.equal(state.mailPort.source, 'file')
    assert.equal(state.mailPort.value, 2525)
  })
})
