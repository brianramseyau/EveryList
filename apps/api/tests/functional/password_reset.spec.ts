import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import PasswordResetMail from '#mails/password_reset_mail'
import PasswordResetToken from '#models/password_reset_token'
import { appUrl } from '#config/app'

const PASSWORD = 'password123'
const NEW_PASSWORD = 'newpassword123'
const ORIGIN = 'https://lists.example.com'

async function signupWithKnownEmail(client: import('@japa/api-client').ApiClient, email: string) {
  const response = await client.post('/api/v1/auth/signup').json({
    fullName: 'Ada Lovelace',
    email,
    password: PASSWORD,
    passwordConfirmation: PASSWORD,
  })
  return response.body().data.token as string
}

/**
 * Requests a reset link for `email`, sending an `Origin` header when `origin`
 * is given, asserting the mail's reset link uses it (or the configured
 * APP_URL as a fallback) and returning the plaintext reset token.
 */
async function resetTokenForEmail(
  fakeMailer: ReturnType<typeof mail.fake>,
  client: import('@japa/api-client').ApiClient,
  email: string,
  origin: string | null = ORIGIN
): Promise<string> {
  const request = client.post('/api/v1/auth/forgot-password').json({ email })
  if (origin) request.header('Origin', origin)
  const forgotResponse = await request
  forgotResponse.assertStatus(204)

  const baseUrl = origin ?? appUrl
  let resetToken = ''
  fakeMailer.mails.assertSent(PasswordResetMail, (sentMail) => {
    const message = sentMail.message
    const text = message.nodeMailerMessage.text
    const match = typeof text === 'string' ? text.match(/\/reset-password\?token=([^\s]+)/) : null
    resetToken = match ? (match[1] ?? '') : ''
    return (
      message.hasTo(email) &&
      message.hasSubject('Reset your EveryList password') &&
      typeof text === 'string' &&
      text.includes(`${baseUrl}/reset-password?token=`)
    )
  })
  return resetToken
}

test.group('Password reset', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(() => {
    mail.fake()
    return () => mail.restore()
  })
  // CI has no real SMTP2GO credentials in its env (nor should it) — stub
  // dummy ones so isMailConfigured() is true by default; the "not
  // configured" test below deletes them for its own scope instead.
  group.each.setup(() => {
    const originalUsername = process.env.SMTP2GO_USERNAME
    const originalPassword = process.env.SMTP2GO_PASSWORD
    process.env.SMTP2GO_USERNAME = 'test-user'
    process.env.SMTP2GO_PASSWORD = 'test-pass'
    return () => {
      if (originalUsername === undefined) delete process.env.SMTP2GO_USERNAME
      else process.env.SMTP2GO_USERNAME = originalUsername
      if (originalPassword === undefined) delete process.env.SMTP2GO_PASSWORD
      else process.env.SMTP2GO_PASSWORD = originalPassword
    }
  })

  test('forgot-password emails a reset link to a registered address', async ({
    client,
    assert,
  }) => {
    await signupWithKnownEmail(client, 'ada@example.com')
    const fakeMailer = mail.fake()

    const resetToken = await resetTokenForEmail(fakeMailer, client, 'ada@example.com')

    assert.isString(resetToken)
    assert.isNotEmpty(resetToken)
  })

  test('forgot-password falls back to APP_URL when the request sends no Origin', async ({
    client,
  }) => {
    await signupWithKnownEmail(client, 'ada@example.com')
    const fakeMailer = mail.fake()

    await resetTokenForEmail(fakeMailer, client, 'ada@example.com', null)
  })

  test('forgot-password for an unknown email returns 204 and sends no mail', async ({ client }) => {
    const fakeMailer = mail.fake()

    const response = await client
      .post('/api/v1/auth/forgot-password')
      .json({ email: 'nobody@example.com' })

    response.assertStatus(204)
    fakeMailer.mails.assertNoneSent()
  })

  test('forgot-password returns 503 when SMTP2GO credentials are not configured', async ({
    client,
  }) => {
    const originalUsername = process.env.SMTP2GO_USERNAME
    const originalPassword = process.env.SMTP2GO_PASSWORD
    delete process.env.SMTP2GO_USERNAME
    delete process.env.SMTP2GO_PASSWORD

    try {
      const response = await client
        .post('/api/v1/auth/forgot-password')
        .json({ email: 'ada@example.com' })

      response.assertStatus(503)
    } finally {
      if (originalUsername !== undefined) process.env.SMTP2GO_USERNAME = originalUsername
      if (originalPassword !== undefined) process.env.SMTP2GO_PASSWORD = originalPassword
    }
  })

  test('forgot-password rejects an invalid email address', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/forgot-password')
      .json({ email: 'not-an-email' })

    response.assertStatus(422)
  })

  test('reset-password sets a new password and invalidates the old one', async ({
    client,
    assert,
  }) => {
    await signupWithKnownEmail(client, 'ada@example.com')
    const fakeMailer = mail.fake()
    const resetToken = await resetTokenForEmail(fakeMailer, client, 'ada@example.com')

    const resetResponse = await client.post('/api/v1/auth/reset-password').json({
      token: resetToken,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    })
    resetResponse.assertStatus(204)

    const oldLogin = await client.post('/api/v1/auth/login').json({
      email: 'ada@example.com',
      password: PASSWORD,
    })
    oldLogin.assertStatus(400)

    const newLogin = await client.post('/api/v1/auth/login').json({
      email: 'ada@example.com',
      password: NEW_PASSWORD,
    })
    newLogin.assertStatus(200)
    assert.isString(newLogin.body().data.token)
  })

  test('reset-password revokes all previously issued access tokens', async ({ client }) => {
    const oldToken = await signupWithKnownEmail(client, 'ada@example.com')
    const fakeMailer = mail.fake()
    const resetToken = await resetTokenForEmail(fakeMailer, client, 'ada@example.com')

    const resetResponse = await client.post('/api/v1/auth/reset-password').json({
      token: resetToken,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    })
    resetResponse.assertStatus(204)

    const oldTokenUse = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${oldToken}`)
    oldTokenUse.assertStatus(401)
  })

  test('reset-password rejects a token that matches no stored hash', async ({ client }) => {
    await signupWithKnownEmail(client, 'ada@example.com')
    const fakeMailer = mail.fake()
    await resetTokenForEmail(fakeMailer, client, 'ada@example.com')

    const response = await client.post('/api/v1/auth/reset-password').json({
      token: 'wrong-token',
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    })

    response.assertStatus(400)
  })

  test('reset-password rejects a token after it has been used', async ({ client }) => {
    await signupWithKnownEmail(client, 'ada@example.com')
    const fakeMailer = mail.fake()
    const resetToken = await resetTokenForEmail(fakeMailer, client, 'ada@example.com')

    const firstReset = await client.post('/api/v1/auth/reset-password').json({
      token: resetToken,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    })
    firstReset.assertStatus(204)

    const secondReset = await client.post('/api/v1/auth/reset-password').json({
      token: resetToken,
      password: 'anotherpassword',
      passwordConfirmation: 'anotherpassword',
    })
    secondReset.assertStatus(400)
  })

  test('reset-password rejects an expired token', async ({ client }) => {
    const token = await signupWithKnownEmail(client, 'ada@example.com')
    const user = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)

    const rawToken = 'expired-reset-token'
    await PasswordResetToken.create({
      userId: user.body().data.id,
      tokenHash: await hash.make(rawToken),
      expiresAt: DateTime.now().minus({ minutes: 5 }),
      revokedAt: null,
    })

    const response = await client.post('/api/v1/auth/reset-password').json({
      token: rawToken,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    })

    response.assertStatus(400)
  })

  test('reset-password rejects a mismatched password confirmation', async ({ client }) => {
    const response = await client.post('/api/v1/auth/reset-password').json({
      token: 'some-token',
      password: NEW_PASSWORD,
      passwordConfirmation: 'different-password',
    })

    response.assertStatus(422)
  })
})
