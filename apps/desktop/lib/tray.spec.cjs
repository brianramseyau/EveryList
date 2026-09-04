'use strict'

const { buildTrayMenuTemplate, shouldHideInsteadOfClose } = require('./tray.cjs')

describe('buildTrayMenuTemplate', () => {
  it('wires Show/Quit items to the given callbacks', () => {
    const onShow = () => {}
    const onQuit = () => {}

    const template = buildTrayMenuTemplate({ onShow, onQuit })

    expect(template).toEqual([
      { label: 'Show EveryList', click: onShow },
      { label: 'Quit EveryList', click: onQuit }
    ])
  })
})

describe('shouldHideInsteadOfClose', () => {
  it('is true when background-run is enabled', () => {
    expect(shouldHideInsteadOfClose(true)).toBe(true)
  })

  it('is false when background-run is disabled', () => {
    expect(shouldHideInsteadOfClose(false)).toBe(false)
  })
})
