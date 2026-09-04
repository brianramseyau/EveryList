'use strict'

/**
 * Tray menu template — pure so it's testable without a real Electron `Tray`/`Menu`
 * (PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md). `onShow`/`onQuit` are plain callbacks; main.cjs
 * wires them to `mainWindow.show()`/`app.quit()`.
 *
 * @param {{ onShow: () => void, onQuit: () => void }} handlers
 * @returns {{ label: string, click: () => void }[]}
 */
function buildTrayMenuTemplate({ onShow, onQuit }) {
  return [
    { label: 'Show EveryList', click: onShow },
    { label: 'Quit EveryList', click: onQuit }
  ]
}

/**
 * Whether closing the window should hide it to the tray instead of actually closing —
 * background-run is opt-in, tied to the deadline notifications toggle (Settings), so a user who
 * never turns notifications on keeps today's plain quit-on-close behavior.
 *
 * @param {boolean} backgroundRunEnabled
 * @returns {boolean}
 */
function shouldHideInsteadOfClose(backgroundRunEnabled) {
  return backgroundRunEnabled === true
}

module.exports = { buildTrayMenuTemplate, shouldHideInsteadOfClose }
