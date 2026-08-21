import { test } from '@japa/runner'

test.group('OpenAPI docs', () => {
  test('serves the Scalar reference UI at /docs', async ({ client, assert }) => {
    const response = await client.get('/docs')

    response.assertStatus(200)
    assert.match(response.header('content-type')!, /text\/html/)
    assert.include(response.text(), 'api-reference')
  })

  test('serves the generated OpenAPI document at /openapi', async ({ client, assert }) => {
    const response = await client.get('/openapi')

    response.assertStatus(200)
    assert.match(response.header('content-type')!, /application\/json/)

    const document = response.body()
    assert.equal(document.openapi, '3.1.0')
    assert.equal(document.info.title, 'EveryList API')
    assert.property(document.paths, '/api/v1/auth/signup')
    assert.property(document.paths, '/api/v1/lists/{listId}/items')
    assert.property(document.paths, '/api/v1/meta')
  })
})
