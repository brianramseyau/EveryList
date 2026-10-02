'use strict'

/**
 * Parses the `--everylist-version=<v>` argument main.cjs passes to a sandboxed preload via
 * BrowserWindow `additionalArguments` — a sandboxed preload can't `require('./package.json')`,
 * so this is how it learns the app version (PLAN_22 §1/§5). Pulled out of preload.cjs so the
 * branch is unit-tested rather than living in excluded wiring (PLAN_36).
 */

const VERSION_ARG_PREFIX = '--everylist-version='

/**
 * @param {string[]} argv typically `process.argv`
 * @param {string} [fallback] returned when no version argument is present
 * @returns {string}
 */
function parseVersionArg(argv, fallback = 'unknown') {
  const arg = Array.isArray(argv)
    ? argv.find((value) => value.startsWith(VERSION_ARG_PREFIX))
    : undefined
  return arg ? arg.slice(VERSION_ARG_PREFIX.length) : fallback
}

module.exports = { parseVersionArg, VERSION_ARG_PREFIX }
