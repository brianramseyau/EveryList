// @ts-check
import { baseConfig } from '../../eslint.config.js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config({ ignores: ['dist/**', 'coverage/**'] }, ...baseConfig, {
  languageOptions: { globals: globals.node }
})
