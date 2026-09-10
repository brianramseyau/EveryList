import { test } from '@japa/runner'
import { isValidIngressPath, rewriteHtmlForIngress } from '#services/ingress_service'

test.group('isValidIngressPath', () => {
  test("accepts Supervisor's real format", ({ assert }) => {
    assert.isTrue(isValidIngressPath('/api/hassio_ingress/abc123def456'))
    assert.isTrue(isValidIngressPath('/api/hassio_ingress/ABC123DEF456'))
  })

  test('rejects a value that would break out of the HTML attribute', ({ assert }) => {
    assert.isFalse(isValidIngressPath('/api/hassio_ingress/abc"><script>alert(1)</script>'))
  })

  test('rejects a value that would break out of the injected <script> body', ({ assert }) => {
    assert.isFalse(isValidIngressPath('/api/hassio_ingress/abc</script><script>alert(1)</script>'))
  })

  test('rejects paths outside the expected prefix', ({ assert }) => {
    assert.isFalse(isValidIngressPath('/etc/passwd'))
    assert.isFalse(isValidIngressPath('/api/hassio_ingress/'))
    assert.isFalse(isValidIngressPath(''))
  })
})

test.group('rewriteHtmlForIngress', () => {
  test('prefixes root-absolute src/href attributes with the ingress path', ({ assert }) => {
    const html =
      '<html><head><link rel="manifest" href="/manifest.webmanifest" /></head>' +
      '<body><script type="module" src="/_app/immutable/entry/start.js"></script></body></html>'

    const rewritten = rewriteHtmlForIngress(html, '/api/hassio_ingress/abc123')

    assert.include(rewritten, 'href="/api/hassio_ingress/abc123/manifest.webmanifest"')
    assert.include(rewritten, 'src="/api/hassio_ingress/abc123/_app/immutable/entry/start.js"')
  })

  test('injects the runtime base global as the first thing in <head>', ({ assert }) => {
    const html = '<head><link rel="manifest" href="/manifest.webmanifest" /></head>'

    const rewritten = rewriteHtmlForIngress(html, '/api/hassio_ingress/abc123')

    assert.isTrue(
      rewritten.indexOf('window.__EVERYLIST_INGRESS_BASE__') <
        rewritten.indexOf('manifest.webmanifest')
    )
    assert.include(
      rewritten,
      '<script>window.__EVERYLIST_INGRESS_BASE__ = "/api/hassio_ingress/abc123";</script>'
    )
  })

  test('handles a <head> tag with attributes', ({ assert }) => {
    const html = '<head lang="en"><body></body></head>'

    const rewritten = rewriteHtmlForIngress(html, '/prefix')

    assert.include(rewritten, '<head lang="en"><script>')
  })

  test('leaves protocol-relative and external URLs untouched', ({ assert }) => {
    const html = '<link href="//cdn.example.com/font.css" /><a href="https://example.com">x</a>'

    const rewritten = rewriteHtmlForIngress(html, '/prefix')

    assert.include(rewritten, 'href="//cdn.example.com/font.css"')
    assert.include(rewritten, 'href="https://example.com"')
  })

  test('leaves already-relative references untouched', ({ assert }) => {
    const html = '<a href="./relative">x</a>'

    const rewritten = rewriteHtmlForIngress(html, '/prefix')

    assert.include(rewritten, 'href="./relative"')
  })
})
