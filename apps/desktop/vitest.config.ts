import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Every *decision* main.cjs/preload.cjs would otherwise make lives in lib/ and is tested
      // (see PLAN_36_PHASE_NATIVE_TEST_COVERAGE.md); those two files keep only Electron
      // event-dispatch and null guards. `include` over lib/ is the whole gate, so — rather than
      // excluding them by name — they're simply outside it. See PLAN_22 §9.
      include: ['lib/**/*.cjs'],
      exclude: ['**/*.spec.cjs'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100
      }
    }
  }
})
