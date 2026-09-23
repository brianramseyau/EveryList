#!/usr/bin/env node
// Produces a self-contained, production `apps/api` build staged at apps/desktop/server/, for
// Standalone mode's embedded server (lib/embedded-server.cjs spawns build/bin/server.js from it
// as a child process) — see foundational/PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md.
//
// Mirrors docker/Dockerfile's build-web -> build-api -> prod-deps stages exactly, since that
// pipeline already solves "produce a production apps/api with a working better-sqlite3": copy the
// web build into apps/api/public (AdonisJS bundles it as a static asset via adonisrc.ts's
// metaFiles), build apps/api, then install production-only deps in a directory with no
// pnpm-workspace.yaml ancestor so pnpm treats it as the standalone project it actually is (a
// workspace-scoped install refuses to resolve "workspace:*" once copied outside the workspace —
// see prod-deps's own comment in the Dockerfile).
//
// Requires apps/web/build and packages/shared/dist to already exist, same precondition
// copy-renderer.mjs has for apps/web/build.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const webBuild = join(repoRoot, 'apps', 'web', 'build')
const sharedDist = join(repoRoot, 'packages', 'shared', 'dist')
const apiRoot = join(repoRoot, 'apps', 'api')
const apiPublic = join(apiRoot, 'public')
const apiBuild = join(apiRoot, 'build')
const serverOut = join(here, '..', 'server')

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) {
    console.error(`${command} ${args.join(' ')} failed with status ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(webBuild)) {
  console.error(
    `apps/web/build not found at ${webBuild} — run "pnpm --filter @everylist/web build" first.`
  )
  process.exit(1)
}
if (!existsSync(sharedDist)) {
  console.error(
    `packages/shared/dist not found at ${sharedDist} — run "pnpm --filter @everylist/shared build" first.`
  )
  process.exit(1)
}

console.log(`Copying ${webBuild} -> ${apiPublic}`)
rmSync(apiPublic, { recursive: true, force: true })
cpSync(webBuild, apiPublic, { recursive: true })

console.log('Building @everylist/api...')
run('pnpm', ['--filter', '@everylist/api', 'build'], { cwd: repoRoot })

if (!existsSync(apiBuild)) {
  console.error(`apps/api/build not found at ${apiBuild} after build — aborting.`)
  process.exit(1)
}

// A fresh directory outside the repo (no pnpm-workspace.yaml ancestor) — see the top comment on
// why this can't be `pnpm install --prod` in place.
const stagingDir = mkdtempSync(join(tmpdir(), 'everylist-desktop-server-'))
try {
  console.log(`Staging production build at ${stagingDir}`)
  cpSync(apiBuild, stagingDir, { recursive: true })

  const packageJsonPath = join(stagingDir, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  delete packageJson.devDependencies
  // "workspace:*" can't be resolved outside the pnpm workspace — vendor the already-built
  // package into node_modules below instead of asking pnpm to install it.
  delete packageJson.dependencies['@everylist/shared']
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

  // --config.node-linker=hoisted is required: pnpm's default ("isolated") linker builds
  // node_modules almost entirely out of symlinks into a `.pnpm` content-addressable store, and
  // Node's own fs.cpSync's `dereference` option only dereferences a symlink passed directly as
  // its `src` argument, NOT symlinks encountered while recursively walking a directory tree
  // (confirmed empirically — see the minimal repro linked from the plan doc) — so a plain
  // recursive copy of an isolated-mode node_modules produces a `server/` directory that looks
  // complete but is actually full of symlinks pointing at this now-deleted stagingDir, and
  // require() fails on everything. The hoisted linker instead installs real directories, which
  // survive a plain copy correctly. Confirmed by actually running this script end to end and
  // requiring the copied better-sqlite3 before this fix was added — it does not work without this.
  console.log('Installing production dependencies (this rebuilds better-sqlite3 for this host)...')
  run('pnpm', ['install', '--prod', '--ignore-workspace', '--config.node-linker=hoisted'], {
    cwd: stagingDir
  })

  const sharedOut = join(stagingDir, 'node_modules', '@everylist', 'shared')
  rmSync(sharedOut, { recursive: true, force: true })
  cpSync(join(repoRoot, 'packages', 'shared', 'package.json'), join(sharedOut, 'package.json'))
  cpSync(sharedDist, join(sharedOut, 'dist'), { recursive: true })

  console.log(`Copying ${stagingDir} -> ${serverOut}`)
  rmSync(serverOut, { recursive: true, force: true })
  cpSync(stagingDir, serverOut, { recursive: true })
} finally {
  rmSync(stagingDir, { recursive: true, force: true })
}

console.log(`Staged production @everylist/api build at ${serverOut}`)
