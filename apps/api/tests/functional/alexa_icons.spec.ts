import { test } from '@japa/runner'

test.group('GET /api/v1/alexa/icons/:name', () => {
  test('returns a PNG for a known icon, unauthenticated', async ({ client, assert }) => {
    const response = await client.get('/api/v1/alexa/icons/basket?color=c2410c')

    response.assertStatus(200)
    assert.match(response.header('content-type')!, /image\/png/)
    assert.match(response.header('cache-control')!, /immutable/)
  })

  test('falls back to the generic glyph for an unknown icon name rather than erroring', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/alexa/icons/notARealIconName?color=c2410c')

    response.assertStatus(200)
    assert.match(response.header('content-type')!, /image\/png/)
  })

  test('defaults the color when none is given', async ({ client, assert }) => {
    const response = await client.get('/api/v1/alexa/icons/basket')

    response.assertStatus(200)
    assert.match(response.header('content-type')!, /image\/png/)
  })

  test('rejects a non-alphanumeric icon name', async ({ client }) => {
    const response = await client.get('/api/v1/alexa/icons/bad-name?color=c2410c')

    response.assertStatus(400)
  })

  test('rejects a malformed color', async ({ client }) => {
    const response = await client.get('/api/v1/alexa/icons/basket?color=not-a-color')

    response.assertStatus(400)
  })
})
