'use strict'

const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Arch } = require('electron-builder')

// electron-builder's `afterPack` hook (see package.json's `build.afterPack`) — rebuilds
// better-sqlite3 for each build's specific target architecture. A single upfront
// `electron-rebuild` run (this project's first approach) only rebuilds for the host machine's
// arch, which silently ships a working server/ for one macOS architecture and a broken one for
// the other in this project's dual-arch (x64 + arm64) mac build — see package.json's
// `mac.target`. `afterPack` runs once per packaged target after `extraResources` has already
// copied `server/` into that target's output, so this rebuilds the actual copy that ships.

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
module.exports = async function afterPack(context) {
  const archName = Arch[context.arch]

  const resourcesDir =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : path.join(context.appOutDir, 'resources')

  const serverDir = path.join(resourcesDir, 'server')
  const electronVersion = require('electron/package.json').version

  console.log(`[rebuild-native-hook] rebuilding better-sqlite3 for ${archName} at ${serverDir}`)
  execFileSync(
    process.execPath,
    [
      require.resolve('@electron/rebuild/lib/cli.js'),
      '--module-dir',
      serverDir,
      '--force',
      '-w',
      'better-sqlite3',
      '--arch',
      archName,
      '--version',
      electronVersion
    ],
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
  )
}
