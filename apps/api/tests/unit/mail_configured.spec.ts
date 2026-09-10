import fs from 'node:fs'
import { test } from '@japa/runner'
import isMailConfigured from '#services/mail_configured'
import { loadFileCache, serverConfigYamlPath, updateServerConfig } from '#services/server_config'
import { smtpTransportConfig } from '#config/mail'

test.group('isMailConfigured', (group) => {
  const original = {
    username: process.env.SMTP2GO_USERNAME,
    password: process.env.SMTP2GO_PASSWORD,
  }

  group.each.teardown(() => {
    if (original.username === undefined) delete process.env.SMTP2GO_USERNAME
    else process.env.SMTP2GO_USERNAME = original.username

    if (original.password === undefined) delete process.env.SMTP2GO_PASSWORD
    else process.env.SMTP2GO_PASSWORD = original.password
  })

  test('is true once both credentials are set', ({ assert }) => {
    process.env.SMTP2GO_USERNAME = 'user'
    process.env.SMTP2GO_PASSWORD = 'pass'

    assert.isTrue(isMailConfigured())
  })

  test('is false when the username is missing', ({ assert }) => {
    delete process.env.SMTP2GO_USERNAME
    process.env.SMTP2GO_PASSWORD = 'pass'

    assert.isFalse(isMailConfigured())
  })

  test('is false when the password is missing', ({ assert }) => {
    process.env.SMTP2GO_USERNAME = 'user'
    delete process.env.SMTP2GO_PASSWORD

    assert.isFalse(isMailConfigured())
  })

  test('is true when the credentials come from /config/config.yaml instead of env vars', async ({
    assert,
  }) => {
    delete process.env.SMTP2GO_USERNAME
    delete process.env.SMTP2GO_PASSWORD

    // updateServerConfig's mail side effect (applyMailConfig) mutates smtpTransportConfig.auth in
    // place — deleting the file and reloading the (separate) fileCache doesn't undo that, so it's
    // snapshotted and restored explicitly, or these credentials would stay live for whatever test
    // runs next in this process.
    const originalAuth = { ...smtpTransportConfig.auth }
    try {
      await updateServerConfig({ mailUsername: 'file-user', mailPassword: 'file-pass' })
      assert.isTrue(isMailConfigured())
    } finally {
      const filePath = serverConfigYamlPath()
      if (fs.existsSync(filePath)) fs.rmSync(filePath)
      loadFileCache()
      Object.assign(smtpTransportConfig.auth, originalAuth)
    }
  })
})
