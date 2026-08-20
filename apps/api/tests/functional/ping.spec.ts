import { test } from '@japa/runner'

test.group('GET /api/v1/ping', () => {
  test('returns a JSON pong without requiring authentication', async ({ client, assert }) => {
    const response = await client.get('/api/v1/ping')

    response.assertStatus(200)
    assert.deepEqual(response.body(), { pong: true })
    assert.match(response.header('content-type')!, /application\/json/)
  })
})
