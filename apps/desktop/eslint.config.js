// @ts-check
import { baseConfig } from '../../eslint.config.js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Vitest's own test globals (describe/it/expect/...) — this workspace runs Vitest with
// `globals: true` rather than importing them per spec file, since `vitest` itself refuses to be
// `require()`d from a CommonJS module (this whole workspace is CJS — see main.cjs's comment on
// why), which rules out apps/web's explicit-import style here.
const vitestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly'
}

export default tseslint.config(
  // A standalone `ignores`-only block, per ESLint flat-config semantics — combined with other
  // keys (as it was before) it only scopes that one block's own rules, leaving renderer/**'s
  // copied-in, unlinted production web bundle to every *other* block (baseConfig's
  // recommended configs included) instead of actually excluding it.
  { ignores: ['coverage/**', 'release/**', 'renderer/**'] },
  ...baseConfig,
  {
    languageOptions: { globals: { ...globals.node, ...vitestGlobals } },
    rules: {
      // This workspace is CommonJS throughout (Electron's main process requires it, and nothing
      // here is bundled) — `require()` is the intended module system, not a lint violation.
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
)
