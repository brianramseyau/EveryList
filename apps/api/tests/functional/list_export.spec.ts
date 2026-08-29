import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import ListExportMail from '#mails/list_export_mail'
import type { ApiClient } from '@japa/api-client'
import type { ItemDto, ListDto } from '@everylist/shared'
import { bodyData, signupAndGetToken } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Test List' })
  return bodyData<ListDto>(response).id
}

test.group('List export', (group) => {
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

  test('emails the uncompleted items on a list', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas', quantity: '2' })

    await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bread' })

    const milk = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Milk' })
    const milkItem = bodyData<ItemDto>(milk)

    await client
      .patch(`/api/v1/lists/${listId}/items/${milkItem.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ checked: true, expectedVersion: milkItem.version })

    const fakeMailer = mail.fake()

    const exportResponse = await client
      .post(`/api/v1/lists/${listId}/export/email`)
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'friend@example.com' })

    exportResponse.assertStatus(204)

    fakeMailer.mails.assertSent(ListExportMail, (sentMail) => {
      const message = sentMail.message
      return (
        message.hasTo('friend@example.com') &&
        message.hasSubject('List: Test List') &&
        typeof message.nodeMailerMessage.text === 'string' &&
        message.nodeMailerMessage.text.includes('Bananas (2)') &&
        message.nodeMailerMessage.text.includes('Bread') &&
        !message.nodeMailerMessage.text.includes('Milk')
      )
    })
  })

  test('emails a placeholder body when the list has no uncompleted items', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const fakeMailer = mail.fake()

    const exportResponse = await client
      .post(`/api/v1/lists/${listId}/export/email`)
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'friend@example.com' })

    exportResponse.assertStatus(204)

    fakeMailer.mails.assertSent(ListExportMail, (sentMail) => {
      const message = sentMail.message
      return (
        typeof message.nodeMailerMessage.text === 'string' &&
        message.nodeMailerMessage.text.includes('(no items)') &&
        typeof message.nodeMailerMessage.html === 'string' &&
        message.nodeMailerMessage.html.includes('(no items)')
      )
    })
  })

  test('returns 503 when SMTP2GO credentials are not configured', async ({ client }) => {
    const originalUsername = process.env.SMTP2GO_USERNAME
    const originalPassword = process.env.SMTP2GO_PASSWORD
    delete process.env.SMTP2GO_USERNAME
    delete process.env.SMTP2GO_PASSWORD

    try {
      const token = await signupAndGetToken(client)
      const listId = await createList(client, token)

      const response = await client
        .post(`/api/v1/lists/${listId}/export/email`)
        .header('Authorization', `Bearer ${token}`)
        .json({ email: 'friend@example.com' })

      response.assertStatus(503)
    } finally {
      if (originalUsername !== undefined) process.env.SMTP2GO_USERNAME = originalUsername
      if (originalPassword !== undefined) process.env.SMTP2GO_PASSWORD = originalPassword
    }
  })

  test('rejects an invalid email address', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const response = await client
      .post(`/api/v1/lists/${listId}/export/email`)
      .header('Authorization', `Bearer ${token}`)
      .json({ email: 'not-an-email' })

    response.assertStatus(422)
  })

  test('rejects a non-member of the list', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const otherToken = await signupAndGetToken(client)

    const response = await client
      .post(`/api/v1/lists/${listId}/export/email`)
      .header('Authorization', `Bearer ${otherToken}`)
      .json({ email: 'friend@example.com' })

    response.assertStatus(404)
  })
})
