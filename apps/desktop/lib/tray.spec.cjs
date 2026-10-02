'use strict'

const {
  buildTrayMenuTemplate,
  shouldHideInsteadOfClose,
  trayAction,
  applyTrayAction
} = require('./tray.cjs')

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

describe('trayAction', () => {
  it('creates the tray when background-run turns on and none exists', () => {
    expect(trayAction({ backgroundRunEnabled: true, hasTray: false })).toBe('create')
  })

  it('destroys the tray when background-run turns off and one exists', () => {
    expect(trayAction({ backgroundRunEnabled: false, hasTray: true })).toBe('destroy')
  })

  it('leaves an existing tray alone while background-run stays on', () => {
    expect(trayAction({ backgroundRunEnabled: true, hasTray: true })).toBe('none')
  })

  it('does nothing when both are already off', () => {
    expect(trayAction({ backgroundRunEnabled: false, hasTray: false })).toBe('none')
  })
})

describe('applyTrayAction', () => {
  it('invokes create and reports it', () => {
    /** @type {string[]} */
    const calls = []
    const ran = applyTrayAction({
      action: 'create',
      create: () => calls.push('create'),
      destroy: () => calls.push('destroy')
    })
    expect(ran).toBe('create')
    expect(calls).toEqual(['create'])
  })

  it('invokes destroy and reports it', () => {
    /** @type {string[]} */
    const calls = []
    const ran = applyTrayAction({
      action: 'destroy',
      create: () => calls.push('create'),
      destroy: () => calls.push('destroy')
    })
    expect(ran).toBe('destroy')
    expect(calls).toEqual(['destroy'])
  })

  it('invokes neither for none', () => {
    /** @type {string[]} */
    const calls = []
    const ran = applyTrayAction({
      action: 'none',
      create: () => calls.push('create'),
      destroy: () => calls.push('destroy')
    })
    expect(ran).toBe('none')
    expect(calls).toEqual([])
  })
})
