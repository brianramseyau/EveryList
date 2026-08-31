#!/usr/bin/env node
// Rasterizes branding/icon.svg (the same source apps/web's `cap:assets` uses for the
// iOS/Android app icons) to apps/desktop/resources/icon.png — electron-builder derives
// .icns/.ico/Linux PNGs from this one file at packaging time (see PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md
// §6). Kept as a script rather than a committed hand export so it can't drift from the SVG.

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const svgPath = join(here, '..', '..', '..', 'branding', 'icon.svg')
const outDir = join(here, '..', 'resources')
const outPath = join(outDir, 'icon.png')

mkdirSync(outDir, { recursive: true })
await sharp(svgPath, { density: 384 }).resize(1024, 1024).png().toFile(outPath)

console.log(`Wrote ${outPath}`)
