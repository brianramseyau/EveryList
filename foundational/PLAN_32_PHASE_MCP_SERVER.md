# Phase 32 — MCP server for the API (in-app, PAT-gated)

## Context

EveryList already exposes its data to unattended external clients through two surfaces: the Alexa
skill (`POST /api/v1/alexa`, PLAN_16 Stage 2) and the Home Assistant HACS integration (a REST +
SSE client in another repo). Both authenticate with scoped Personal Access Tokens — per-list
`editor`/`viewer` grants encoded as abilities, reduced by `ListPolicy.effectiveRole`, never
exceeding the underlying account's membership and never owner. This phase adds a third surface: an
**MCP (Model Context Protocol) server** living inside the API app, so AI clients (Claude Desktop,
Claude Code, remote MCP hosts, …) can read and edit lists through the same scoped-token model.

Decisions locked (and the reasoning, so this isn't re-litigated):

- **In-app server, not a separate translator process.** Two architectures were weighed:
  - *A translator* (separate process speaking MCP and proxying the REST API, the
    `mcp-for-argocd` pattern) has one genuine advantage: business rules live behind REST
    endpoints, so it cannot drift from them, and the API image's blast radius stays zero.
    EveryList's typed, documented OpenAPI surface (PLAN_15) makes that path unusually cheap.
  - *An in-app server* won anyway: the selling point of this app is **one container** — a
    self-hoster gets MCP by upgrading the server, with zero new artifacts to run; MCP rides the
    exact PAT rails Alexa/HA already use (`pat` guard + `ListPolicy`), and it compiles against the
    app's internals so no second deployment, release train, or client-compat matrix exists.
    The translator's "no drift" advantage is bought in-app instead with thin-tool discipline:
    tools only orchestrate already-tested services and are pinned by tests, never reimplement
    rules (see "Shared logic" below).
- **Package: `@jrmc/adonis-mcp`.** The Adonis-native wrapper (packages.adonisjs.com listing;
  zero runtime deps; optional peer `@adonisjs/bouncer` unused here — this app authorizes through
  `ListPolicy`, not Bouncer). Verified against the published v2.0.0 tarball: it registers
  `mcp:start` (stdio), `mcp:inspector`, `make:mcp-{tool,resource,prompt}` ace commands, patches
  `router.mcp()` (typed via module augmentation), binds the request's `auth` into the MCP tool
  context (`http_transport.js#bindAuth`), serves both the stateless `2026-07-28` protocol and
  legacy `initialize` sessions, and ships a fake transport for tests. The official
  `@modelcontextprotocol/sdk` was considered and rejected as the first choice: more hand-rolled
  glue (routing/auth/DI/transports) for no benefit this app needs; it stays the documented
  fallback if the spike below fails.
- **Enabled by default, PAT-gated.** The route is always registered; access requires a valid PAT.
  Like the `lists` group, this is "the surface exposed to always-on external clients", so it gets
  its own PAT-keyed throttle. No `MCP_ENABLED`/server-config flag — an unauthenticated request can
  do nothing but fail authentication, and every PAT's reach is already capped at `editor` on
  explicitly granted lists.
- **Curated tools, not auto-generated from the spec.** ~70 REST endpoints mechanically wrapped
  would degrade model tool-selection quality (the same reason `mcp-for-argocd` ships ~20
  purpose-built tools rather than its full k8s surface). ~12 LLM-ergonomic tools chosen from the
  spec, with list-name resolution built into the tools that need it.
- **CLI is out of scope here** — see `PLAN_33_PHASE_CLI_CLIENT.md`.

## Threat model / authorization invariants

The whole surface is only as permissive as the PAT that authenticated the request:

- The route requires the `pat` guard — a login-session token cannot use MCP at all (an MCP client
  is an external, unattended client by definition, the same policy the Alexa skill's PAT-only
  framing enforces). 401 otherwise; the protocol middleware's 400s still apply.
- Every tool call resolves its target list through `ListPolicy.requireList(user, listId, minRole)`
  (or the name-resolution helper over the token's grants) — the same path every HTTP route takes.
  Viewer-granted lists refuse every write tool; a list with no grant doesn't exist (404-shaped
  error, indistinguishable from a wrong id — no probe).
- Tools never mint/alter tokens, never touch backup settings, server config, admin users,
  push, webhooks, or anything instance-wide. The tool set is deliberately list/item-scoped.
- Tokens are never logged; tool error surfaces carry ids and messages, never credentials.

## Shared logic (the "no duplicated business rules" rule)

MCP tools are thin: each handler loads the list via `ListPolicy`, then orchestrates the same
services every other client path is required to use — `findItemByName`/`restoreItemRow`/
`nextSortOrder` (`item_reuse.ts`), `hasCapacityFor`/`limitReachedMessage[ForUncheck]`/
`remainingCapacity` (`unchecked_limit.ts`), `countOpenSubtasks`/`subtasksIncompleteMessage`
(`subtask_completion.ts`), `suggestCategoryId`/`learnCategory`
(`category_suggestion_service.ts`), `completeItemRow`/`uncheckItemRow` (`alexa/intent_router.ts` —
already the shared mutation behind voice+touch completion), `broadcastSync`
(`sync_broadcaster.ts`). Every add-by-name path must stay on `findItemByName` (documented
footgun: three past regressions), and every mutation must end with a `broadcastSync` so
realtime/offline clients reconcile.

A tiny `app/services/mcp/` layer holds only what the tools share with each other (grants →
lists lookup, name→list resolution, error → tool-error mapping). If it ever grows into a
reimplementation of controller logic, that's the code review line to push back on — the follow-up
worth considering is extracting an `item_commands` service shared by `items_controller`, Alexa's
intent router and MCP (out of scope here).

## Route, middleware, config

- `router.mcp().use([middleware.mcp(), middleware.auth({ guards: ['pat'] }), mcpThrottle])`
  in `start/routes.ts`, registered inside the routes file before the SPA catch-all (the package's
  provider defines the macro in its own `start()` hook, which runs before preloads — verified in
  the tarball).
- `mcpThrottle` in `start/limiter.ts`, keyed on `currentAccessToken.identifier`, no-limit in
  tests (same shape as `listsThrottle`; MCP is an always-on external-client surface).
- CSRF is already disabled app-wide (`config/shield.ts`), so the package docs' CSRF-exclusion
  step is a no-op here.
- `config/mcp.ts`: name/version/instructions only; no cache hints, completions off.
- `/mcp` added to `openapiConfig.exclude` — the JSON-RPC endpoint is not part of the REST docs or
  the Tuyau registry.
- `.adonisjs/` regenerated via `pnpm dev` and committed (documented footgun), the same as every
  route change.

## Files

New/changed in `apps/api`:

- `package.json` — `@jrmc/adonis-mcp` dependency
- `adonisrc.ts` — provider, `@jrmc/adonis-mcp/commands`, (no custom `directories.mcp`)
- `app/middleware/mcp_middleware.ts` — the package-generated protocol middleware
- `start/kernel.ts` — `mcp` named middleware
- `start/routes.ts` — the route above
- `start/limiter.ts` — `mcpThrottle`
- `config/mcp.ts` — server identity
- `app/services/mcp/*.ts` — shared access/item-operation helpers
- `app/mcp/tools/*_tool.ts` — one file per tool
- `app/mcp/resources/list_items_resource.ts` — `everylist://lists/{listId}` resource
- `config/openapi.ts` — `/mcp` exclusion
- `tests/unit/mcp/*.spec.ts`, `tests/functional/mcp.spec.ts`

## Testing (100% coverage holds — `app/mcp/**` and the middleware are in `app/**/*.ts`)

- Unit: each tool instantiated directly, `handle` driven through both success and every refusal
  branch (no grant → not-found, viewer → forbidden, capacity, subtask gate, dedup/restore) via the
  package's fake transport; `app/services/mcp` helpers unit-tested directly.
- Functional: JSON-RPC over `POST /mcp` with minted PATs — missing/invalid token 401, viewer vs
  editor, `tools/list` shape, `tools/call` round-trip, protocol middleware branches
  (content-type, modern vs legacy protocol headers).
- Manual: `node ace mcp:inspector` in dev.
- `.mcp-inspector.json` is gitignored (the inspector writes credentials into it).

## Docs

`docs/mcp.md`: mint a list-scoped PAT (`Settings → Access Tokens`), point an MCP HTTP client at
`https://<host>/mcp` with `Authorization: Bearer elt_…`, connect a stdio-only client via the
generic `mcp-remote` bridge, dev-only `node ace mcp:inspector` note. README gets a bullet in
"Features"/"Voice control & integrations" next to Alexa/Home Assistant. A `.env.example` note is
not needed (no new env config).

## Verification

- Spike gate first (before any tool code): `pnpm install` clean, `pnpm dev` emits both codegen
  lines and regenerates `.adonisjs/`, `pnpm typecheck` green.
- `pnpm check --skip-e2e` clean; `apps/api` coverage gate (stmts/branches/functions/lines) intact
  with `app/mcp/**` included.
- Functional manual pass: mint viewer + editor PATs, `curl` an `initialize` + `tools/list` +
  `tools/call` sequence, confirm a viewer-PAT write fails and an editor-PAT write lands on the
  web app via SSE (the realtime-sync invariant).

## Risks / notes

- **Young third-party dependency** (~3.7K installs, single maintainer, v2.0.0 Aug 2026). The
  spike gate exists to fail fast; pinned exact version; fallback documented above.
- **Coverage burden** is the largest cost of the in-app path, priced into the plan.
- **Protocol drift**: the package targets MCP `2026-07-28` (stateless) with legacy-era fallback
  for older clients; if a future client generation needs what the package can't serve, the tool
  handlers themselves don't change — only the transport/protocol layer does.