#!/usr/bin/env node
// Copies apps/web's static build into apps/desktop/renderer/ before packaging, rather than
// electron-builder's `files: [{ from: "../web/build", to: "renderer" }]` mapping — that mapping
// risks fighting pnpm's symlinked workspace layout (see PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §6),
// and a plain directory copy sidesteps the question entirely. Requires apps/web/build to already
// exist (`pnpm --filter @everylist/web build`).

import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webBuild = join(here, '..', '..', 'web', 'build')
const renderer = join(here, '..', 'renderer')

if (!existsSync(webBuild)) {
  console.error(
    `apps/web/build not found at ${webBuild} — run "pnpm --filter @everylist/web build" first.`
  )
  process.exit(1)
}

rmSync(renderer, { recursive: true, force: true })
cpSync(webBuild, renderer, { recursive: true })

console.log(`Copied ${webBuild} -> ${renderer}`)
