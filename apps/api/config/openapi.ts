import { readFileSync } from 'node:fs'
import type { OpenApiConfig } from '#services/openapi/generator'

/**
 * `node ace build` writes a standalone package.json (with the source
 * package's version) next to this file's compiled output, so this resolves
 * correctly both in dev (`apps/api/package.json`) and in the production
 * build (`build/package.json`) — see docker/Dockerfile's build-api stage.
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
    description:
      'Self-hosted shopping list API. Endpoints are bearer-token protected except where noted.',
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
  exclude: [],
  endpoints: { ui: '/docs', spec: '/openapi' },
  buildSpecPath: '.adonisjs/openapi.json',
  // Served from public/ (not under /docs) so the static middleware's directory
  // redirect for `public/docs/` can't 301 the `/docs` route to `/docs/`.
  uiAssetPath: '/scalar.js',
}

export default openapiConfig
