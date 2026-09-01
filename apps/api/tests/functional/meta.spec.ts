import { test } from '@japa/runner'
import env from '#start/env'

test.group('GET /api/v1/meta', () => {
  test('returns build metadata without requiring authentication', async ({ client, assert }) => {
    const response = await client.get('/api/v1/meta')

    response.assertStatus(200)
    const body = response.body()
    assert.properties(body, ['version', 'commit', 'builtAt', 'publicSignupEnabled'])
  })

  test('defaults to nightly/unknown when build env vars are absent', async ({ client, assert }) => {
    const response = await client.get('/api/v1/meta')

    response.assertStatus(200)
    assert.equal(response.body().version, 'nightly')
    assert.equal(response.body().commit, 'unknown')
    assert.equal(response.body().builtAt, 'unknown')
  })

  test('defaults publicSignupEnabled to true', async ({ client, assert }) => {
    const response = await client.get('/api/v1/meta')

    response.assertStatus(200)
    assert.isTrue(response.body().publicSignupEnabled)
  })

  test('reflects PUBLIC_SIGNUP_ENABLED=false', async ({ client, assert }) => {
    env.set('PUBLIC_SIGNUP_ENABLED', false)

    try {
      const response = await client.get('/api/v1/meta')

      response.assertStatus(200)
      assert.isFalse(response.body().publicSignupEnabled)
    } finally {
      env.set('PUBLIC_SIGNUP_ENABLED', true)
    }
  })
})
