import { readFileSync } from 'node:fs'
import { API_VERSION } from '@everylist/shared'
import type { OpenApiConfig } from '#services/openapi/generator'

/**
 * `node ace build` writes a standalone package.json (with the source
 * package's version) next to this file's compiled output, so this resolves
 * correctly both in dev (`apps/api/package.json`) and in the production
 * build (`build/package.json`) — see docker/Dockerfile's build-api stage.
 *
 * This is the *API's* version, not the release tag: `scripts/prepare-release.mjs`
 * only bumps it when the API (or the shared DTOs it compiles against) changed
 * since the last stable tag, so `info.version` truthfully names the last release
 * whose API surface moved. See foundational/PLAN_34_PHASE_API_VERSIONING.md.
 */
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as {
  version: string
}

/**
 * OpenAPI documentation configuration. The document is generated from the
 * Tuyau registry (routes + validators + transformers) and served under
 * `/docs` (Scalar UI) and `/openapi` (raw spec).
 */
const openapiConfig: OpenApiConfig = {
  info: {
    title: 'EveryList API',
    version,
    description: `Self-hosted list API (${API_VERSION} contract). Endpoints are bearer-token protected except where noted.`,
  },
  servers: [{ url: '/' }],
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'token',
    },
  },
  publicRouteNames: ['auth.', 'metas.show', 'invite_accept.preview'],
  // The MCP JSON-RPC endpoint (foundational/PLAN_32_PHASE_MCP_SERVER.md) is not part of the
  // REST surface — it rides the `router.mcp()` macro (a bare POST to a package-internal
  // controller with no Tuyau-typed request/response) rather than the validator/transformer
  // pipeline the registry generator documents, so it must be kept out of the generated
  // document entirely.
  exclude: ['/mcp'],
  endpoints: { ui: '/docs', spec: '/openapi' },
  buildSpecPath: '.adonisjs/openapi.json',
  // Served from public/ (not under /docs) so the static middleware's directory
  // redirect for `public/docs/` can't 301 the `/docs` route to `/docs/`.
  uiAssetPath: '/scalar.js',
}

export default openapiConfig
