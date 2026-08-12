import { test } from '@japa/runner'

test.group('GET /api/v1/meta', () => {
  test('returns build metadata without requiring authentication', async ({ client, assert }) => {
    const response = await client.get('/api/v1/meta')

    response.assertStatus(200)
    const body = response.body()
    assert.properties(body, ['version', 'commit', 'builtAt'])
  })

  test('defaults to nightly/unknown when build env vars are absent', async ({ client, assert }) => {
    const response = await client.get('/api/v1/meta')

    response.assertStatus(200)
    assert.equal(response.body().version, 'nightly')
    assert.equal(response.body().commit, 'unknown')
    assert.equal(response.body().builtAt, 'unknown')
  })
})
