import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.cjs'],
      // main.cjs/preload.cjs are Electron wiring that can only be exercised by
      // actually launching an app (see PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §9) — every
      // decision they'd otherwise make lives in lib/ instead, so those two files
      // contain no branching of their own and are excluded from the coverage gate
      // rather than widening it.
      exclude: ['main.cjs', 'preload.cjs', '**/*.spec.cjs'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
})
