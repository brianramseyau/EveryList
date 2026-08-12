// @ts-check
import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

/**
 * Shared base config, spread into by each workspace's own eslint.config.js
 * (apps/api, apps/web, packages/shared) so every workspace lints against the
 * same rules while still owning its framework-specific additions.
 */
export const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier
)

export default tseslint.config(...baseConfig, {
  ignores: [
    '**/dist/**',
    '**/build/**',
    '**/.svelte-kit/**',
    '**/node_modules/**',
    '**/coverage/**',
    'apps/api/tmp/**'
  ]
})
