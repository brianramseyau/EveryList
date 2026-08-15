import { test } from '@japa/runner'
import isMailConfigured from '#services/mail_configured'

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
})
