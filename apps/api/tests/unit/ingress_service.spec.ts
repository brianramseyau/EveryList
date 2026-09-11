import { test } from '@japa/runner'
import { isValidIngressPath, rewriteHtmlForIngress } from '#services/ingress_service'

test.group('isValidIngressPath', () => {
  test("accepts Supervisor's real base64url token format", ({ assert }) => {
    assert.isTrue(isValidIngressPath('/api/hassio_ingress/abc123def456'))
    assert.isTrue(isValidIngressPath('/api/hassio_ingress/ABC123DEF456'))
    // A real live token (43 chars, consistent with secrets.token_urlsafe(32)) - mixed case,
    // digits, and `-`/`_`, not hex-only. An earlier version of this pattern was hex-only and
    // rejected every real Supervisor request as a result.
    assert.isTrue(
      isValidIngressPath('/api/hassio_ingress/QyD5J3f3eD4KkmgnytItUFej8hkIzAHqbCqbJcjnV-Y')
    )
    assert.isTrue(isValidIngressPath('/api/hassio_ingress/abc_123-XYZ'))
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

  test("prefixes the inline bootstrap script's dynamic import() calls, not just HTML attributes", ({
    assert,
  }) => {
    // adapter-static's real bootstrap: a plain (non-module) <script> whose body dynamically
    // imports the entry chunk by a root-absolute string literal, not an HTML src/href attribute -
    // see build/200.html. Missing this one means the app never loads under Ingress at all.
    const html =
      '<script>\n' +
      '  Promise.all([\n' +
      '    import("/_app/immutable/entry/start.js"),\n' +
      '    import("/_app/immutable/entry/app.js")\n' +
      '  ]).then(([kit, app]) => kit.start(app, element));\n' +
      '</script>'

    const rewritten = rewriteHtmlForIngress(html, '/api/hassio_ingress/abc123')

    assert.include(rewritten, 'import("/api/hassio_ingress/abc123/_app/immutable/entry/start.js")')
    assert.include(rewritten, 'import("/api/hassio_ingress/abc123/_app/immutable/entry/app.js")')
  })

  test('leaves a relative or already-external import() call untouched', ({ assert }) => {
    const html = 'import("./local.js"); import("https://cdn.example.com/mod.js");'

    const rewritten = rewriteHtmlForIngress(html, '/prefix')

    assert.include(rewritten, 'import("./local.js")')
    assert.include(rewritten, 'import("https://cdn.example.com/mod.js")')
  })

  test('injects the runtime base global as the first thing in <head>', ({ assert }) => {
    const html = '<head><link rel="manifest" href="/manifest.webmanifest" /></head>'

    const rewritten = rewriteHtmlForIngress(html, '/api/hassio_ingress/abc123')

    assert.isTrue(
      rewritten.indexOf('window.__EVERYLIST_INGRESS_BASE__') <
        rewritten.indexOf('manifest.webmanifest')
    )
    assert.include(rewritten, 'window.__EVERYLIST_INGRESS_BASE__ = "/api/hassio_ingress/abc123";')
  })

  test('registers the asset-fixup service worker at the ingress-prefixed scope', ({ assert }) => {
    const html = '<head></head>'

    const rewritten = rewriteHtmlForIngress(html, '/api/hassio_ingress/abc123')

    assert.include(
      rewritten,
      'navigator.serviceWorker.register("/api/hassio_ingress/abc123/_ha-ingress-sw.js", { scope: "/api/hassio_ingress/abc123/" })'
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
