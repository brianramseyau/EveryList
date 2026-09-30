# Phase 33 — CLI client (`apps/cli`)

## Context

EveryList's API is a documented, bearer-token surface (`/api/v1`; the Scalar reference UI is at
`/docs` and the raw OpenAPI document at `/openapi` — PLAN_15) with a mature Personal Access Token
model (per-list `editor`/`viewer` grants, PLAN_16 Stage 0).
Every non-browser client so far is integration-shaped: Alexa (voice), Home Assistant (smart-home
entities), and after Phase 32, MCP (AI assistants). What doesn't exist is the boring one: a plain
**command-line client** for humans and scripts — `everylist add "milk" -l Groceries`,
`everylist items Groceries`, wired to the same PAT model.

This phase is **unrelated to MCP** (PLAN_32) by design: the MCP server serves AI tool-calling; the
CLI serves interactive and scripted use. They happen to share auth (PATs) and DTOs
(`@everylist/shared`), but neither depends on the other, so this ships separately. Repo-local, not
its own repo: npm has no HACS-style structural requirement forcing a split (same reasoning as
PLAN_16's monorepo decision — the constraint there was HACS's `custom_components/<domain>/` repo
layout, which npm doesn't have), it can share the workspace's `@everylist/shared` build and CI
gates, and a solo maintainer shouldn't pay a second release train for a zero-distribution benefit.

Decisions locked:

- **Workspace member** `apps/cli` (`@everylist/cli`), like `apps/desktop` — **repo-local first,
  npm publish deferred** until the command surface is proven; adding it to `pnpm-workspace.yaml`
  now costs nothing (desktop precedent: a workspace package absent from the Docker build context
  doesn't break the image build, and the CLI is never in the image anyway).
- **HTTP client, not a DB client.** It talks to a running server over REST with a PAT — same
  threat model and throttles as every other external client. It never opens the SQLite file
  (that would bypass `ListPolicy` and collide with the single-process WAL writer).
- **Command surface mirrors the API's most-used reads/writes**, not the full ~70 routes: `token`
  (configure/test the PAT + base URL), `lists`, `items <list>`, `add <list> <item>`,
  `complete <list> <item>`, maybe `uncheck`/`remove`. Details to be locked in this plan's own
  design pass when the phase starts.

## Outcomes

- New `apps/cli` workspace: TypeScript, a small arg parser (no framework dependency until needed),
  config file under the platform config dir holding base URL + PAT (file permissions 0600; token
  never echoed or logged — REVIEW.md's token-hygiene rule).
- Own lint/typecheck/test scripts wired into `pnpm check` via the workspace defaults, sharing
  `@everylist/shared` DTO types.
- README + docs section when it lands.

## Sequencing

Independent of Phase 32; start whenever the command surface matters to a real workflow (e.g.
scripted seeding, cron reminders, or dogfooding the API from a terminal).

## Design (locked)

The surface was locked when this phase started:

- **No framework, no build step at runtime for the installed command.** `tsc` compiles `src/` to
  `dist/` (same as `packages/shared`), and `bin/everylist.mjs` imports `dist/`. Node 24's native
  TypeScript support means a source checkout can also run `src/` directly, but the shipped command
  targets the compiled output so it behaves identically everywhere.
- **Zero runtime dependencies.** `fetch` (Node 24 global), `node:fs`, `node:path`, `node:os`, and
  `@everylist/shared`'s DTO _types_ only. The argument parser is ~60 lines in `src/args.ts`: the
  first bare token is the command, the rest are positionals, and `--name value`/`--name=value`/`-x`
  all populate flags. A small set of known boolean flags (`--json`, `--all`, `--help`, `--version`)
  never consume a following token, so `--json lists` can't swallow the command name.
- **Config under the platform config dir** (`src/config.ts`): `baseUrl` + `token` in `config.json`,
  written `0600` atomically (temp file + rename), with `EVERYLIST_URL`/`EVERYLIST_TOKEN` env
  overrides and a per-invocation `--url`/`--token` flag on top. `EVERYLIST_CONFIG_DIR` redirects the
  directory (tests, exotic setups). Every read tolerates a missing/malformed file by falling back to
  "unset", never throwing — a broken config can't be why the tool won't report what's wrong.
- **Grant-scoped resolution** (`src/resolve.ts`). `GET /api/v1/lists` returns every list the _account_
  is a member of, regardless of a PAT's grants, so every command intersects that with
  `GET /api/v1/tokens/me` before resolving a name/id. This is the CLI's copy of the same rule the MCP
  access layer (`apps/api/app/services/mcp/access.ts`) applies: a list outside the token's grants
  behaves exactly like a missing one (no probing). A name matching more than one list/item is refused
  with the candidate ids rather than guessed.
- **Commands** (`src/commands/`): `login`, `token`, `lists`, `list`, `items`, `add`, `complete`,
  `uncheck`, `remove`, `search`. Every one takes `--json` for scripting; `<list>`/`<item>` accept an
  id or a name. Item-name resolution prefers the open (unchecked) row when a checked history row
  shares the name — mirroring the server's `findItemByName` ordering, so `complete Milk` doesn't
  resurrect a completed row.
- **Exit codes** (`src/errors.ts`): `0` success, `1` runtime/API failure, `2` usage error, `3`
  auth/config. `run()` returns the code instead of calling `process.exit`, so it's fully testable.
- **Token hygiene.** The full token is never printed — only a `elt_abc…wxyz` mask — and is only ever
  written to the `0600` file or sent in the `Authorization` header. Cleartext `http://` is refused
  for any non-loopback host (a PAT is a real credential), with `EVERYLIST_ALLOW_INSECURE=1` as the
  explicit opt-in for a trusted LAN. Every request carries a 30s deadline so a stalled server can't
  hang a cron/CI run.
- **Testing**: Vitest, 100% coverage on all four metrics, the same gate every other workspace meets.
  Every command is exercised with a fake API client (injected), a recording output sink, and a fake
  prompt, so nothing touches a real network or TTY.

## Deliberately deferred

- **npm publish.** Repo-local until the command surface proves itself in real use (see the workspace
  decision above). `bin`/`exports` are already wired so publishing is a `private: false` flip plus an
  `npm publish`, not a restructure.
- **Token minting from the CLI.** `login` consumes an existing PAT; minting one needs the account's
  owner role, which a PAT (capped below owner) can never supply. Mint from `Settings → Access Tokens`.
- **Full command coverage of the ~70 REST routes.** Mirrors the plan's "most-used reads/writes" scope;
  add commands (favorites, folders, subtasks, move, export) as real workflows call for them.
