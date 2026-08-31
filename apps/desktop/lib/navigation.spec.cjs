'use strict'

const { shouldOpenExternally, isAppOrigin } = require('./navigation.cjs')

describe('shouldOpenExternally', () => {
  it('allows http and https', () => {
    expect(shouldOpenExternally('http://example.com')).toBe(true)
    expect(shouldOpenExternally('https://example.com/note')).toBe(true)
  })

  it('denies non-web protocols', () => {
    expect(shouldOpenExternally('file:///etc/passwd')).toBe(false)
    expect(shouldOpenExternally('javascript:alert(1)')).toBe(false)
  })

  it('denies an unparseable URL', () => {
    expect(shouldOpenExternally('not a url')).toBe(false)
  })
})

describe('isAppOrigin', () => {
  it('matches the app origin on the configured port', () => {
    expect(isAppOrigin('http://127.0.0.1:41783/lists', 41783)).toBe(true)
    expect(isAppOrigin('http://localhost:41783/', 41783)).toBe(true)
  })

  it('rejects a different port', () => {
    expect(isAppOrigin('http://127.0.0.1:9999/lists', 41783)).toBe(false)
  })

  it('rejects a non-loopback host', () => {
    expect(isAppOrigin('http://example.com:41783/', 41783)).toBe(false)
  })

  it('rejects https (the app is always served over plain http)', () => {
    expect(isAppOrigin('https://127.0.0.1:41783/', 41783)).toBe(false)
  })

  it('rejects an unparseable URL', () => {
    expect(isAppOrigin('not a url', 41783)).toBe(false)
  })
})
