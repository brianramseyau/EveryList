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