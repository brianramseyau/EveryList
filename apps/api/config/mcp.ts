import { defineConfig } from '@jrmc/adonis-mcp'
import { readFileSync } from 'node:fs'

/**
 * MCP server identity (foundational/PLAN_32_PHASE_MCP_SERVER.md). The endpoint itself is
 * registered in start/routes.ts via `router.mcp()` and is authenticated by the `pat` guard —
 * a scoped Personal Access Token is the only credential that can use it, so this file carries
 * no per-feature feature flags. Served from `public/`? No — version is read from this app's
 * package.json the same way config/openapi.ts builds `info.version` (see that file's comment
 * on `node ace build`'s standalone package.json), so `/mcp`'s serverInfo stays truthful in both
 * dev and the production build.
 */
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as {
  version: string
}

export default defineConfig({
  name: 'everylist',
  version,
  instructions:
    'EveryList — a shared shopping/todo list app. Use list_lists first; tools resolve lists by ' +
    'name or id. Reads work on viewer-granted lists; writes need an editor grant.',
  // completions: true,
  // cache: {
  //   tools: { ttlMs: 60_000, scope: 'private' },
  // },
})
