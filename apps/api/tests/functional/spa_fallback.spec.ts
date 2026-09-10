import fs from 'node:fs'
import app from '@adonisjs/core/services/app'
import { test } from '@japa/runner'

// apps/api/public/* is a build output directory (gitignored except .gitkeep - see
// apps/web/vite.config.ts's adapter-static build, copied in by docker/Dockerfile) and isn't
// present in a fresh checkout, so this fixture stands in for the real 200.html the SvelteKit
// build produces.
const FIXTURE =
  '<html><head><link rel="manifest" href="/manifest.webmanifest" /></head><body>fallback</body></html>'

test.group('SPA fallback / Home Assistant Ingress entry point', (group) => {
  const path = () => app.publicPath('200.html')

  group.each.setup(() => {
    fs.writeFileSync(path(), FIXTURE)
    return () => fs.rmSync(path(), { force: true })
  })

  test('serves 200.html unchanged when there is no ingress header', async ({ client, assert }) => {
    const response = await client.get('/some/unprerendered/route')

    response.assertStatus(200)
    assert.equal(response.text(), FIXTURE)
    assert.notInclude(response.text(), '__EVERYLIST_INGRESS_BASE__')
  })

  test('rewrites the shell and injects the base global when x-ingress-path is present', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/ha-ingress-entry')
      .header('x-ingress-path', '/api/hassio_ingress/abc123')

    response.assertStatus(200)
    assert.include(
      response.text(),
      '<script>window.__EVERYLIST_INGRESS_BASE__ = "/api/hassio_ingress/abc123";</script>'
    )
    assert.include(response.text(), 'href="/api/hassio_ingress/abc123/manifest.webmanifest"')
    assert.match(response.header('content-type')!, /text\/html/)
    assert.equal(response.header('vary'), 'x-ingress-path')
  })

  test('falls back to the unmodified shell when x-ingress-path does not match the expected format', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/ha-ingress-entry').header('x-ingress-path', '/etc/passwd')

    response.assertStatus(200)
    assert.equal(response.text(), FIXTURE)
    assert.notInclude(response.text(), '__EVERYLIST_INGRESS_BASE__')
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

test.group('Ingress scope-shadowing service worker route', () => {
  test('serves a plain-passthrough worker script', async ({ client, assert }) => {
    const response = await client.get('/_ha-ingress-shadow-sw.js')

    response.assertStatus(200)
    assert.match(response.header('content-type')!, /text\/javascript/)
    const body = response.text()
    assert.include(body, 'skipWaiting')
    assert.include(body, 'clients.claim()')
    assert.include(body, 'fetch(event.request)')
  })
})
