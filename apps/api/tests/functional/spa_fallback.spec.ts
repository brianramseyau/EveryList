import { test } from '@japa/runner'

test.group('SPA fallback / Home Assistant Ingress entry point', () => {
  test('serves 200.html unchanged when there is no ingress header', async ({ client, assert }) => {
    const response = await client.get('/some/unprerendered/route')

    response.assertStatus(200)
    assert.notInclude(response.text(), '__EVERYLIST_INGRESS_BASE__')
  })

  test('rewrites the shell and injects the base global when x-ingress-path is present', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/_ha-ingress-entry')
      .header('x-ingress-path', '/api/hassio_ingress/abc123')

    response.assertStatus(200)
    assert.include(
      response.text(),
      '<script>window.__EVERYLIST_INGRESS_BASE__ = "/api/hassio_ingress/abc123";</script>'
    )
    assert.match(response.header('content-type')!, /text\/html/)
  })

  test('still 404s a missed /api/* route as JSON, ingress header or not', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/v1/does-not-exist')
      .header('x-ingress-path', '/api/hassio_ingress/abc123')

    response.assertStatus(404)
    assert.equal(response.body().message, 'Not found')
  })
})
