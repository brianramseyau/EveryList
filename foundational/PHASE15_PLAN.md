# Phase 15 — OpenAPI/Swagger docs for the API

## Goal

Expose machine-readable, self-hosted API documentation as a first-class part of the API
deployment: a Scalar reference UI at **`/docs`** and the raw OpenAPI 3.1 document at
**`/openapi`**, both served by the single AdonisJS process, fully offline, with no premium tier.

## Background

The API (AdonisJS 6) had no machine-readable spec and no docs UI. Its only "contract" was the
hand-written `start/routes.ts` plus the Tuyau registry that `@tuyau/core` generates into
`.adonisjs/client/registry/schema.d.ts` on every dev boot (routes + VineJS validators +
transformers → typed client). The registry already carries everything a spec generator needs —
per-endpoint `methods`, `pattern`, and `types.{body,query,response,errorResponse}` — so it is the
single source of truth, with no new annotations required on the routes.

### Why not `@tuyau/openapi`

The obvious package, `@tuyau/openapi@1.0.2` (latest), was evaluated and rejected. It was built for
Tuyau **0.x**: its generator hardcodes reading `.adonisjs/api.ts` with an `ApiDefinition` shaped as
`{ $get: { request, response } }`. This repo runs `@tuyau/core@1.2.2`, which generates a different
artifact (`.adonisjs/client/registry/schema.d.ts`, entries shaped `{ methods, pattern, types }`).
The package would fail to find `.adonisjs/api.ts`. Rather than downgrade Tuyau (which the frontend's
typed surface depends on), the registry is consumed directly by a small first-party generator.

## Design decisions (locked)

- **Source of truth**: the Tuyau registry (`schema.d.ts`). No changes to routes/validators/
  transformers; the docs stay in sync with the typed client automatically.
- **Generator**: a first-party `ts-morph`-backed generator under `app/services/openapi/`. `ts-morph`
  is already in the tree (transitively via `@adonisjs/assembler`) and resolves the registry's
  conditional types (`ExtractBody<InferInput<…>>`, `ExtractResponse<Awaited<ReturnType<…>>>`,
  `SerializeJSONTypes` → `DateTime` becomes `string | null`) to concrete JSON shapes.
- **Renderer**: Scalar (modern, light/dark), vendored locally for offline use — not loaded from a
  CDN. The single-file Scalar bundle is copied from `@scalar/api-reference` into `public/` at
  dev boot and into `build/public/` at build time.
- **Visibility**: public. The docs describe the API shape only (no data), so `/docs` and `/openapi`
  are unauthenticated.
- **Format**: the served spec is JSON (`/openapi`). The build-time artifact is
  `build/.adonisjs/openapi.json`.
- **Auth semantics**: a global `security: [{ bearerAuth: [] }]` with per-route overrides; routes
  listed in `publicRouteNames` get `security: []`.
- **Tags/summaries**: auto-derived from route names (`auth`, `lists`, `items`, …); `operationId`
  is the route name. A `Route.openapi()` macro + `MetaStore` allow per-route overrides later.

## Backend

### Generator (`apps/api/app/services/openapi/`)

- `type_mapper.ts` — pure TypeScript-type → OpenAPI 3.1 schema mapping (primitives, arrays,
  objects + `required[]`, unions, literals, `boolean` literals, nullability via 3.1's
  `type: ['x', 'null']`, `never`/`undefined` members skipped, intersections treated as objects).
  Depends only on a narrow `TypeLike` interface (unit-tested with fakes, no ts-morph).
- `meta_store.ts` — route-name → `OperationObject` overrides from the `Route.openapi()` macro.
- `assets.ts` — `copyScalarStandalone(from, to)` (mkdir + copy the Scalar bundle).
- `generator.ts` — `TsMorphType` adapter (resolves property types via `getTypeAtLocation`),
  `generateOpenApiDocument({ config, metaStore, registrySourceFile })`,
  `createProject(tsConfigPath)`, `loadRegistrySourceFile(project, path)`, and the `OpenApiConfig`
  interface.

### Config (`apps/api/config/openapi.ts`)

`info`, `servers`, `securitySchemes` (bearer), `publicRouteNames`, `exclude`, `endpoints`
(`{ ui: '/docs', spec: '/openapi' }`), `buildSpecPath` (`.adonisjs/openapi.json`), `uiAssetPath`
(`/scalar.js` — deliberately **not** under `/docs/`, so the static middleware's directory redirect
for `public/docs/` can't 301 the `/docs` route).

### Command (`apps/api/commands/openapi_generate.ts`)

`node ace openapi:generate [--destination=openapi.json]` — generates the doc and writes it to disk.
Auto-scanned from `./commands`.

### Provider (`apps/api/providers/openapi_provider.ts`)

- Registers the `Route.openapi()` macro (writes into `MetaStore`).
- `boot()`: copies the Scalar asset into `public/` (dev only), then registers `GET /openapi`
  (spec) and `GET /docs` (Scalar HTML referencing `/openapi` + `/scalar.js`).
- Spec resolution: prod reads the baked file; dev generates on the fly (cached). The generator is
  **dynamically imported only in the dev branch** so `ts-morph` (a devDependency) is never loaded
  by the production runtime — which serves the pre-built spec instead.

### Production build (`apps/api/hooks/openapi_build.ts` + `adonisrc.ts`)

`buildFinished` assembler hook: generates `build/.adonisjs/openapi.json` and copies the Scalar
bundle to `build/public/scalar.js`. The compiled `build/` ships no tsconfig/`.ts` sources/registry,
so the spec must be baked in at build time; the hook runs `generateRegistry()`-fresh state.

## Files to add/change

- **Add**: `apps/api/app/services/openapi/{type_mapper,meta_store,assets,generator}.ts`;
  `apps/api/config/openapi.ts`; `apps/api/commands/openapi_generate.ts`;
  `apps/api/providers/openapi_provider.ts`; `apps/api/hooks/openapi_build.ts`;
  `apps/api/tests/unit/openapi/{type_mapper,meta_store,assets,generator}.spec.ts`;
  `apps/api/tests/functional/openapi.spec.ts`.
- **Change**: `apps/api/adonisrc.ts` (register provider + `buildFinished` hook);
  `apps/api/package.json` (dev deps: `ts-morph`, `openapi-types`, `@scalar/api-reference`);
  `apps/api/app/controllers/{items,lists,categories,folders,stores,favorite_items}_controller.ts`
  (version-conflict `response.status(409).send(...)` → `response.conflict(...)`),
  `apps/api/app/controllers/lists_controller.ts` + `categories_controller.ts`
  (`response.status(422).send(...)` → `response.unprocessableEntity(...)`),
  `apps/api/app/controllers/{password_reset,list_export}_controller.ts`
  (`response.status(503).send(...)` → `response.serviceUnavailable(...)`).

## Tests

- Unit: `type_mapper` (fakes, all branches), `meta_store`, `assets`, `generator`
  (`generateOpenApiDocument` against an in-memory ts-morph project + a self-contained fixture
  `schema.d.ts`, plus the real committed registry for `createProject`/`loadRegistrySourceFile`).
- Functional: `GET /docs` returns HTML; `GET /openapi` returns a valid 3.1 doc with expected paths.

## Verification

- `pnpm check --skip-e2e` clean (build shared, lint + typecheck all workspaces, coverage-gated
  test suites). API `services/openapi` at 100% stmts/branch/funcs/lines.
- Manual dev: `pnpm --filter @everylist/api dev` → open `/docs` (renders offline) and `/openapi`.
- Manual prod: `node ace build` → `build/.adonisjs/openapi.json` + `build/public/scalar.js` exist;
  `node bin/server.js` (NODE_ENV=production) serves `/docs` (200 HTML), `/openapi` (200 JSON),
  `/scalar.js` (200 JS). CI's `docker-smoke` job covers the Docker image end-to-end.

## Risks / notes

- **Non-2xx responses must use Tuyau-typed helpers to appear in the docs.** The registry only
  types responses returned via `response.<helper>(...)` (e.g. `conflict`, `unprocessableEntity`,
  `serviceUnavailable`, `forbidden`, `badRequest`) — the generic `response.status(n).send(...)`
  returns an untyped value that `ExtractErrorResponse` drops. The controllers were converted
  accordingly (409 → `conflict`, 422 → `unprocessableEntity`, 503 → `serviceUnavailable`), so the
  11 version-conflict endpoints, the duplicate-name 422s, and the two "mail not configured" 503s
  are now documented. Future endpoints must follow the same rule.
- **`/api/v1/ping` is absent** from the docs: it's an inline closure (not a controller), so the
  registry generator doesn't type it. It's an internal liveness probe, not part of the API surface.
- **`ts-morph` is dev-only** by design — keep the dynamic import in the provider's dev branch; a
  static import would break the production `pnpm install --prod` runtime.
- Response types resolve through `serialize(...)` + transformers to concrete JSON (incl.
  `DateTime → string | null` and the `{ data: … }` envelope) — verified against the real registry.
