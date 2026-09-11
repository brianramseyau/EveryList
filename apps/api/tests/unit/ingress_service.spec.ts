import { test } from '@japa/runner'
import {
  getValidatedRemoteUser,
  isGenuineIngressRequest,
  isValidIngressPath,
  resolveTrustedIngressProxyIp,
  rewriteHtmlForIngress,
} from '#services/ingress_service'

const SUPERVISOR_IP = '172.30.32.2'

function fakeRequest(headers: Record<string, string>, ip = SUPERVISOR_IP) {
  return { header: (name: string) => headers[name], ip: () => ip }
}

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

test.group('resolveTrustedIngressProxyIp', () => {
  test('returns the real Supervisor IP in production regardless of any override', ({ assert }) => {
    assert.equal(resolveTrustedIngressProxyIp(true, '127.0.0.1'), '172.30.32.2')
  })

  test('returns the real Supervisor IP outside production with no override set', ({ assert }) => {
    assert.equal(resolveTrustedIngressProxyIp(false, undefined), '172.30.32.2')
  })

  test('honors the override outside production', ({ assert }) => {
    assert.equal(resolveTrustedIngressProxyIp(false, '127.0.0.1'), '127.0.0.1')
  })
})

test.group('getValidatedRemoteUser', () => {
  test('matches an IPv4 peer reported in IPv4-mapped-IPv6 form', ({ assert }) => {
    // Node reports an IPv4 peer as `::ffff:<ipv4>` on a dual-stack socket - a real Supervisor
    // connection could arrive this way even though trustedIngressProxyIp() is a plain dotted-quad.
    const remoteUser = getValidatedRemoteUser(
      fakeRequest(
        {
          'x-ingress-path': '/api/hassio_ingress/abc123',
          'x-remote-user-id': '1',
          'x-remote-user-name': 'alice',
        },
        `::ffff:${SUPERVISOR_IP}`
      )
    )

    assert.deepEqual(remoteUser, { id: '1', username: 'alice', displayName: 'alice' })
  })

  test('parses the remote-user identity on a genuinely validated ingress request', ({ assert }) => {
    const remoteUser = getValidatedRemoteUser(
      fakeRequest({
        'x-ingress-path': '/api/hassio_ingress/abc123',
        'x-remote-user-id': '1',
        'x-remote-user-name': 'alice',
        'x-remote-user-display-name': 'Alice',
      })
    )

    assert.deepEqual(remoteUser, { id: '1', username: 'alice', displayName: 'Alice' })
  })

  test('falls back to the username when no display name header is sent', ({ assert }) => {
    const remoteUser = getValidatedRemoteUser(
      fakeRequest({
        'x-ingress-path': '/api/hassio_ingress/abc123',
        'x-remote-user-id': '1',
        'x-remote-user-name': 'alice',
      })
    )

    assert.deepEqual(remoteUser, { id: '1', username: 'alice', displayName: 'alice' })
  })

  test('ignores the headers entirely when x-ingress-path is missing', ({ assert }) => {
    // Anyone reaching this container directly through the add-on's optional port (bypassing
    // Supervisor's Ingress proxy) could send these headers themselves — see the "Trust boundary"
    // note in ingress_service.ts.
    assert.isNull(
      getValidatedRemoteUser(
        fakeRequest({ 'x-remote-user-id': '1', 'x-remote-user-name': 'alice' })
      )
    )
  })

  test('ignores the headers when x-ingress-path fails validation', ({ assert }) => {
    assert.isNull(
      getValidatedRemoteUser(
        fakeRequest({
          'x-ingress-path': '/not/a/real/ingress/path',
          'x-remote-user-id': '1',
          'x-remote-user-name': 'alice',
        })
      )
    )
  })

  test('returns null with no headers at all', ({ assert }) => {
    assert.isNull(getValidatedRemoteUser(fakeRequest({})))
  })

  test('returns null when the ingress path is valid but Supervisor sent no session data', ({
    assert,
  }) => {
    assert.isNull(
      getValidatedRemoteUser(fakeRequest({ 'x-ingress-path': '/api/hassio_ingress/abc123' }))
    )
  })

  test("rejects a request not from Supervisor's fixed proxy IP, even with otherwise-valid headers", ({
    assert,
  }) => {
    // This is the actual attack the "trust boundary" doc comment describes: the add-on's optional
    // direct port shares the same container port Ingress traffic arrives on, so a client on that
    // port could send a perfectly valid-looking x-ingress-path and X-Remote-User-Name itself. The
    // source IP is the only thing that can't be forged this way.
    assert.isNull(
      getValidatedRemoteUser(
        fakeRequest(
          {
            'x-ingress-path': '/api/hassio_ingress/abc123',
            'x-remote-user-id': '1',
            'x-remote-user-name': 'alice',
          },
          '203.0.113.7'
        )
      )
    )
  })
})

test.group('isGenuineIngressRequest', (group) => {
  const original = process.env.SUPERVISOR_INGRESS_PROXY_IP
  group.each.teardown(() => {
    if (original === undefined) delete process.env.SUPERVISOR_INGRESS_PROXY_IP
    else process.env.SUPERVISOR_INGRESS_PROXY_IP = original
  })

  test('SUPERVISOR_INGRESS_PROXY_IP overrides the trusted IP, for the test suite only', ({
    assert,
  }) => {
    process.env.SUPERVISOR_INGRESS_PROXY_IP = '127.0.0.1'
    assert.isTrue(
      isGenuineIngressRequest(
        fakeRequest({ 'x-ingress-path': '/api/hassio_ingress/abc123' }, '127.0.0.1')
      )
    )
    // The real production default no longer matches once overridden.
    assert.isFalse(
      isGenuineIngressRequest(fakeRequest({ 'x-ingress-path': '/api/hassio_ingress/abc123' }))
    )
  })

  test('true for a request from the trusted proxy IP with a valid ingress path', ({ assert }) => {
    assert.isTrue(
      isGenuineIngressRequest(fakeRequest({ 'x-ingress-path': '/api/hassio_ingress/abc123' }))
    )
  })

  test('false from a non-Supervisor source IP', ({ assert }) => {
    assert.isFalse(
      isGenuineIngressRequest(
        fakeRequest({ 'x-ingress-path': '/api/hassio_ingress/abc123' }, '203.0.113.7')
      )
    )
  })

  test('false with no ingress path at all', ({ assert }) => {
    assert.isFalse(isGenuineIngressRequest(fakeRequest({})))
  })

  test('false with a malformed ingress path', ({ assert }) => {
    assert.isFalse(
      isGenuineIngressRequest(fakeRequest({ 'x-ingress-path': '/not/a/real/ingress/path' }))
    )
  })
})
