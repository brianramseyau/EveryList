// @ts-check
import { baseConfig } from '../../eslint.config.js'
import tseslint from 'typescript-eslint'

export default tseslint.config(...baseConfig, {
  ignores: ['dist/**', 'coverage/**']
})
