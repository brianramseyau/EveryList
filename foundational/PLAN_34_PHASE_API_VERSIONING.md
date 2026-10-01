# Phase 34 — API versioning: truthful labels + a documented contract policy

## Context

Every release today is cut as one git tag (`vX.Y.Z`) and that tag is the _functional_ version
source for every artifact: `docker-publish.yml` tags the image from it, `native-build.yml` parses
Android's `versionCode`/`versionName` from it and injects it into `apps/desktop`'s
`package.json` before packaging, and the Docker build bakes it into `APP_VERSION` (what
`GET /api/v1/meta` reports as the running image version). `scripts/prepare-release.mjs`
additionally writes the same number into every workspace `package.json`, but those are mostly
hygiene — the tag is what ships.

Two of those package versions are real, though, and both describe the **API**, not the app:

- `apps/api/config/openapi.ts` reads `apps/api/package.json`'s version into the OpenAPI document's
  `info.version` (served at `/docs` and `/openapi`).
- `apps/api/config/mcp.ts` reads the same value into the MCP server's `serverInfo.version`.

So today "the API's version" silently means "the last release tag", even when a release changed
only the web client or an Android widget — `/docs` claims a new API version when the API surface
did not move. Meanwhile the HTTP contract has a de-facto major (`/api/v1`, `start/routes.ts`'s
`.prefix('/api/v1')`) with no stated policy about what may change within it. That gap started to
matter once the API grew clients this repo cannot update in step with the server: the Alexa
skill, the Home Assistant HACS integration (another repo), Personal Access Token scripts, the MCP
server (PLAN_32), and the CLI (PLAN_33). A self-hoster or script author has no in-repo signal for
"is this server's API surface what my client expects?".

This phase fixes both halves with one decision: **truthful labels, one train.** The release train
stays single — native and desktop wrappers embed the whole web bundle, so they can never version
or release independently (a "desktop-only" changelog would still restate the full web app). What
changes is that the API's _own_ version moves only when the API (or the shared DTOs it compiles
against) actually changed, and that the contract's compatibility rules are written down.

Decisions locked (and the reasoning, so this isn't re-litigated):

- **One release train.** Per-app git tags (`api/v1.2.3`), per-workspace GitHub releases, and
  Changesets are all rejected: they assume artifacts that ship independently, and none here do
  (one Docker image always contains one web + one API build; every wrapper embeds the web bundle).
- **Truthful bumping for `apps/api` and `packages/shared` only.** Those two are moved to the
  release version only when `apps/api/**` or `packages/shared/**` changed since the last stable
  tag; otherwise they keep their previous version, so `/docs` and `/mcp` report the last release
  in which the API actually changed. Every other workspace (`root`, `web`, `desktop`, `cli`)
  keeps syncing to the tag unconditionally — they are clients/artifacts of the release train.
- **Documented breaks within `/api/v1`; `/api/v2` reserved but not built.** Splitting the route
  tree for every incompatible change is a large, permanent tax (duplicated controllers, compat
  shims, a removal policy) on a solo-maintained, single-image app whose only true external
  consumers are token-gated integrations. The contract instead follows the deprecation procedure
  below, and a genuinely incompatible split stays available if a break can't be staged.
- **The contract major lives in one place.** `packages/shared/src/constants.ts` already exports
  `API_VERSION = 'v1'`, matching the route prefix, and is unit-tested. The API's meta response
  gains an `apiVersion` field carrying it; no second constant is introduced.

## The policy (what goes in `PLAN_34`, and what agents/devs follow)

**Contract surface.** The `/api/v1` REST routes (documented at `/docs`, `/openapi`) are the
versioned contract. Additive changes are safe at any time; breaking changes follow the procedure
below.

**Additive (non-breaking — ship freely):**

- A new route under `/api/v1`.
- A new optional request field (validators only reject what they know and require; a field a
  client doesn't send is simply absent).
- A new response property (JSON consumers ignore unknown fields; a required TS field on a shared
  DTO is still additive for the wire).
- A new optional query parameter, a new enum value **only** where no in-repo consumer switches
  exhaustively on it. `packages/shared` consumers use `assertNever` in places; adding a variant to
  such an enum is breaking _in-repo_ and must be treated as a breaking change (update every
  exhaustive switch in the same PR).

**Breaking (needs the procedure):** removing or renaming a route; removing or renaming a response
field; changing a field's type or meaning; making an optional request field required (or
tightening a validator so it rejects input that previously succeeded); changing an existing
route's auth requirement or status codes; removing an enum value.

**Deprecation procedure:**

1. Mark the affected OpenAPI operation/field `deprecated: true` in the generated document (via the
   route's transformer/validator metadata) and, where practical, keep the old shape working
   alongside the new one.
2. Call it out in the release notes: a `**Breaking:**` bullet plus a sentence in the `Upgrading:`
   paragraph (both already the house style — see `AGENTS.md`'s release steps). PAT/API consumers
   read these; the app's own clients never need them, since they ship in the same image.
3. Remove it no earlier than the next stable release in which the replacement already shipped.
4. If a change cannot be staged that way (e.g. a security fix), ship it and say so explicitly in
   `Upgrading:`; the escape hatch is `/api/v2`, not an unannounced break.

**MCP is not part of this contract.** The `/mcp` JSON-RPC endpoint is deliberately _outside_
`/api/v1` and excluded from the OpenAPI document. MCP clients discover tools and their schemas at
connection time, so adding/removing a tool or changing its `inputSchema` is a normal change —
announce it in the release notes, but it does not gate the REST contract version and needs no
deprecation window. (Its `serverInfo.version` does use the truthful `apps/api` version, which is
the only version signal an MCP client sees.)

## Changes

### Shared contract

- `packages/shared/src/meta.ts` — `MetaResponse` gains a required `apiVersion: string`, documented
  as the `/api/v1` contract major. No new constant: the controller passes the existing
  `API_VERSION` (`packages/shared/src/constants.ts`).
- `packages/shared/src/index.ts` already re-exports both files; confirm import ergonomics.

### API

- `apps/api/app/controllers/metas_controller.ts` — add `apiVersion: API_VERSION` to the response
  body. `version`/`commit`/`builtAt`/`publicSignupEnabled` are unchanged; `version` stays the
  _image_ version (`APP_VERSION`), which is a different, still-useful fact ("which release am I
  running?") from the API contract major.
- `apps/api/config/openapi.ts` — one added line in `info.description` naming the contract major
  from `API_VERSION`. Deliberately not a `x-api-contract-version` extension: `openapi-types`'
  `InfoObject` has no index signature, and a description line is equally machine-readable without
  fighting the type (the generator already casts for the top-level `x-tagGroups`, but an `info`
  extension would need the same trick for no benefit).
- `apps/api/start/routes.ts` — a comment at `.prefix('/api/v1')` pointing at this plan, so the
  next person changing the prefix finds the policy.

### Release tooling

- `scripts/prepare-release.mjs` — resolve the last stable tag with
  `git describe --abbrev=0 --exclude='*-rc.*' --match='v*'` (falling back to the oldest tag for the
  first run), then diff `apps/api/**` and `packages/shared/**` against `HEAD`. If either changed,
  set both `apps/api/package.json` and `packages/shared/package.json` to the release version;
  otherwise leave them untouched and log which paths were unchanged and why. `root`, `web`,
  `desktop`, `cli`, `shared` keep the existing unconditional loop. (Note: `apps/cli` was brought
  into the loop by a separate fix, PR #277, before this phase.)

### Docs

- `AGENTS.md` — a short "API contract versioning" subsection under Working conventions: the
  additive/breaking taxonomy, that MCP is out of scope, the deprecation procedure, and where the
  version surfaces (`/api/v1/meta`'s `apiVersion`, OpenAPI `info.version` + description,
  `apps/api/package.json`). This is the pointer the policy relies on for agents.
- This plan file is the long-form reference for the rationale and the locked decisions.

## Tests

- `apps/api/tests/functional/meta.spec.ts` — assert `body.apiVersion === API_VERSION` (imported
  from `@everylist/shared`) and add it to the existing shape assertion.
- `apps/api/tests/functional/openapi.spec.ts` — assert `info.version` is a bare semver and that
  the description names the contract major.
- Web specs that stub `/api/v1/meta` — add `apiVersion: 'v1'` to the mocked bodies (at least
  `apps/web/src/routes/settings/page.svelte.spec.ts`; sweep for others).
- `packages/shared` already covers `API_VERSION` in `tests/shared.test.ts`; if the new field's
  type needs explicit coverage, extend there (the constant is not new, so the counter should not
  move).

## Verification

- Reproduce the truthful bumping before trusting it: scratch branches (or a scratch clone) with
  (a) an `apps/api`-touching change since the last stable tag — both files bump; (b) no
  api/shared change — both stay, everything else bumps. The script has no unit tests (consistent
  with the other release scripts), so this is a manual, documented run.
- `pnpm check` clean (api + web + shared + cli + desktop coverage gates, lint, typecheck).
- If the `routes.ts` comment trips the committed `.adonisjs/` regeneration, run `pnpm dev`, confirm
  both codegen log lines, and commit the result (documented footgun).
- Manual: boot the API and confirm `GET /api/v1/meta` carries `apiVersion: "v1"`, `/docs` shows the
  api package version, and `/mcp`'s `serverInfo.version` still resolves.

## Files

- `foundational/PLAN_34_PHASE_API_VERSIONING.md` (this file)
- `packages/shared/src/meta.ts`
- `apps/api/app/controllers/metas_controller.ts`
- `apps/api/config/openapi.ts`
- `apps/api/start/routes.ts` (comment)
- `scripts/prepare-release.mjs`
- `apps/api/tests/functional/meta.spec.ts`, `apps/api/tests/functional/openapi.spec.ts`
- `apps/web/src/routes/settings/page.svelte.spec.ts` (+ any other meta stubs)
- `AGENTS.md`

## Risks / notes

- **Two versions on one screen.** Settings shows `Server <meta.version>` (the image/release
  version); `/docs` shows the API version. After this phase they can legitimately differ (e.g.
  image `1.8.0` whose API last changed at `1.7.6`). That is the point — the OpenAPI document is
  honest about when the contract last moved — but the plan's docs and the `AGENTS.md` note must
  say so, or it will read as a bug.
- **Scoping the diff.** `apps/api/**` includes tests and the committed `.adonisjs/` registry, so a
  test-only or codegen-only change also counts as "api changed". Keeping the rule that simple is
  deliberate (a test change doesn't mean the contract changed, but the version is only a label; no
  build or artifact keys off it). Refining to exclude tests would add a second rule for no benefit.
- **Not a compatibility matrix.** A truthful version label does not make old clients safe against a
  new server beyond the policy the procedure enforces — it makes the _signal_ truthful so clients
  and users can act on it.

## Deliberately deferred

- **Per-app tags, per-workspace GitHub releases, Changesets.** Rejected above; revisit only if an
  artifact ever genuinely releases on its own cadence (e.g. the CLI being published to npm as a
  versioned package, at which point it might get its own version stream).
- **`/api/v2` route tree.** Reserved for a break that can't be staged; no code is built for it now.
- **Surfacing the contract version in the web UI.** `apiVersion` rides along in `/api/v1/meta`; the
  Settings "About" row keeps showing the image version. Add a line there only if users ask.
