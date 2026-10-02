#!/usr/bin/env node
/**
 * Runs the iOS `EveryListTests` XCTest target on a Simulator, resolving a destination that
 * actually exists on this machine.
 *
 * `xcodebuild test` needs a concrete Simulator, and the set of available device names changes
 * with every Xcode/runner-image update (a hard-coded `name=iPhone 16` broke the moment the
 * macos-latest image shipped only iPhone 16e/17/Air). Rather than pin a name that rots, this
 * asks `simctl` for the available iPhone Simulators and picks the newest iOS runtime. Shared by
 * `.github/workflows/test.yml`'s `ios` job and `scripts/check.mjs` so both stay in sync.
 *
 * macOS-only (needs `xcrun` + Xcode); callers gate on `process.platform === 'darwin'`.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * The newest available iPhone Simulator's UDID, or null when none exists.
 * @returns {string | null}
 */
export function findIosSimulatorUdid() {
  let parsed
  try {
    parsed = JSON.parse(
      execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8' })
    )
  } catch {
    return null
  }
  const devices = parsed && parsed.devices ? parsed.devices : {}
  // Runtime keys look like `com.apple.CoreSimulator.SimRuntime.iOS-26-5`; sort lexically so the
  // newest iOS wins. (Lexical ordering is fine for single/double-digit majors and minors.)
  const runtimes = Object.keys(devices)
    .filter((runtime) => runtime.includes('iOS'))
    .sort()
    .reverse()

  for (const runtime of runtimes) {
    const iphone = (devices[runtime] || []).find(
      (device) =>
        device &&
        device.isAvailable !== false &&
        typeof device.name === 'string' &&
        device.name.startsWith('iPhone')
    )
    if (iphone && iphone.udid) return iphone.udid
  }
  return null
}

function main() {
  if (process.platform !== 'darwin') {
    console.error('ios-test.mjs: xcodebuild/Xcode is macOS-only.')
    process.exit(1)
  }
  const udid = findIosSimulatorUdid()
  if (!udid) {
    console.error('ios-test.mjs: no available iPhone Simulator found (is Xcode installed?).')
    process.exit(1)
  }
  console.log(`Running the iOS XCTest suite on Simulator ${udid}…`)
  const result = spawnSync(
    'xcodebuild',
    [
      'test',
      '-project',
      'apps/ios/App/App.xcodeproj',
      '-scheme',
      'App',
      '-configuration',
      'Debug',
      '-destination',
      `id=${udid}`,
      '-derivedDataPath',
      'build',
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO'
    ],
    { stdio: 'inherit', cwd: repoRoot }
  )
  if (result.status !== 0) {
    console.error('ios-test.mjs: xcodebuild test failed.')
    process.exit(result.status ?? 1)
  }
}

// Run only when invoked directly (imported by nothing else today, but keep it import-safe).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
