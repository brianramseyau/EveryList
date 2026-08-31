'use strict'

const { contentTypeForPath } = require('./mime.cjs')

describe('contentTypeForPath', () => {
  it('maps known extensions', () => {
    expect(contentTypeForPath('/build/index.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeForPath('/build/_app/start.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeForPath('/build/style.css')).toBe('text/css; charset=utf-8')
    expect(contentTypeForPath('/build/favicon.svg')).toBe('image/svg+xml')
  })

  it('is case-insensitive on the extension', () => {
    expect(contentTypeForPath('/build/IMAGE.PNG')).toBe('image/png')
  })

  it('falls back to application/octet-stream for unknown or missing extensions', () => {
    expect(contentTypeForPath('/build/LICENSE')).toBe('application/octet-stream')
    expect(contentTypeForPath('/build/archive.zip')).toBe('application/octet-stream')
  })
})
