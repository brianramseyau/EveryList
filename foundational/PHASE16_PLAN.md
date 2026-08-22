# Phase 16 — Voice assistant integration: Personal Access Tokens, Home Assistant, Alexa

## Goal

Give EveryList voice control via two paths: Home Assistant Voice Assist and an Alexa custom
skill. Both need a way for an external, unattended client to authenticate against the API —
which today only issues login-derived, unscoped, auto-rotating bearer tokens. This phase is
three stages: **Stage 0** adds scoped Personal Access Tokens (PATs), **Stage 1** builds the
Home Assistant integration on top of it, **Stage 2** builds the Alexa skill on top of it.
Stage 0 is a hard prerequisite for both. Build order is HA first (higher ceiling, lower
lift), Alexa second — but Alexa gets built to a genuinely usable bar, not a toy, since it's
the assistant the household actually uses day to day.

## Background

Two architectural questions were resolved with evidence rather than left open:

- **Monorepo vs. separate repo for the HA integration → separate repo.** HACS requires
  `custom_components/<domain>/` at the repo root, one integration per repo, and versions the
  integration via that repo's own GitHub releases — nesting it in the EveryList monorepo
  would conflate its release tags with app releases. EveryList's main repo is already public,
  which is the other HACS requirement, but that's not the deciding factor.
- **All-or-nothing vs. fine-grained PATs → fine-grained but simple.** Reuse the existing
  per-list `owner/editor/viewer` role system (`apps/api/app/policies/list_policy.ts`) rather
  than a generic ACL engine: a token is scoped to specific list(s) with a role capped at
  `editor`. This matters concretely for the household's use case — an Alexa/HA integration
  should not be able to touch a "Gift Ideas" list just because the underlying account can.

Research trail: HACS structural requirements and the `TodoListEntity`/Voice Assist pattern
were verified against current HACS docs and a community precedent (a HACS integration doing
this exact thing for another shared-list app). Alexa's direct-HTTPS-endpoint option (skip
Lambda, since the self-hosted instance already has a CA-trusted cert via the Cloudflare
tunnel) and its request-signature-verification requirement were verified against Amazon's ASK
docs. AdonisJS's `DbAccessTokensProvider` API (`type`, `prefix`, `expiresIn`, per-token
`abilities: string[]`, `.allows()`/`.authorize()`) was verified directly against the installed
package's `.d.ts` files, and the `auth_access_tokens` table schema (`type`, `name`,
`abilities`, `expires_at` columns) was verified against the actual migration — both support
the design below without new packages or migrations.

---

## Stage 0 — Personal Access Tokens

**Status: implemented and verified** (typecheck/lint/tests green across all workspaces, 100%
coverage maintained). Not yet committed as of this writing — reviewed but pending `git commit`.

### The critical thing this stage must get right

Today, `ListPolicy.roleFor`/`requireList`/`storeRoleFor`
(`apps/api/app/policies/list_policy.ts`) authorize purely from the `list_members` table by
`userId` — nothing anywhere in `apps/api` reads `currentAccessToken.abilities` (grepped: zero
hits on `.allows(`, `.denies(`, `.authorize(`). Routes are gated only by `middleware.auth()`
on the `api` guard. That means if a PAT is minted today using the existing
`User.accessTokens` provider, it would authenticate exactly like a full login token — **a
token "scoped" to one list at "viewer" would in practice grant full editor/owner access to
every list the user belongs to**, because nothing downstream distinguishes which token
authenticated the request. This is exactly the endpoint surface Stage 1 and Stage 2 will hand
to unattended external clients, so the scoping fix must land in the *same PR* as the minting
endpoint, not after.

### Design

Add a second token bucket rather than repurposing `User.accessTokens` (whose
`expiresIn: '30 days'` is wrong for a PAT meant to live indefinitely in a HACS config entry):

```ts
// apps/api/app/models/user.ts
static accessTokens = DbAccessTokensProvider.forModel(User, { expiresIn: '30 days' })                  // unchanged: login/session
static personalAccessTokens = DbAccessTokensProvider.forModel(User, { type: 'pat', prefix: 'elt_' })    // no forced expiry
```

Both share the existing `auth_access_tokens` table (already has `type`/`name`/`abilities`/
`expires_at` columns — no migration needed). `.all(user)` on `personalAccessTokens` only
returns `type='pat'` rows, so login-token and PAT listings partition naturally.

**Abilities encoding**: one string per granted list, `list:<id>:editor` or `list:<id>:viewer`.
Never mint `list:<id>:owner` (enforce in the validator). **A single token can carry grants for
several lists** — one entry in `abilities` per list — rather than one token per list: an
integration like HA/Alexa wants one credential covering every list it should reach, not a
separate config entry per list (many-lists-to-one-token, not one-list-to-one-token). This was
the actual design used; `ListPolicy`'s grant lookup already iterated over all of a token's
abilities from the start, so supporting multiple lists per token required no change to the
scoping logic itself — only to how tokens are minted, listed, and routed (below).

**`ListPolicy` fix**: `requireList`, `roleFor`, and `storeRoleFor` must intersect the
membership-derived role with the token's encoded grants when `currentAccessToken.type ===
'pat'` (falling through unchanged for ordinary login tokens), returning "not found" —
matching the existing not-a-member masking — for any list the token isn't scoped to,
regardless of the user's real membership. **Also fix `authorizeListChannel` in
`apps/api/start/transmit.ts`** the same way — easy to miss since it's not in
`app/controllers/`, but a PAT that can mint scoped REST access but subscribe to any of the
user's list SSE channels defeats the point.

### Files

- `apps/api/app/models/user.ts` — add `personalAccessTokens` provider (above).
- `apps/api/app/policies/list_policy.ts` — PAT-aware `requireList`/`roleFor`/`storeRoleFor`.
- `apps/api/start/transmit.ts` — same fix in `authorizeListChannel`.
- `apps/api/app/controllers/personal_access_tokens_controller.ts` (new — name it this, not
  `access_tokens_controller.ts`, which already exists for login tokens) — a top-level resource,
  not nested under a list, since a token isn't owned by one list:
  - `index`: `User.personalAccessTokens.all(user)`, decoded via `decodeGrants` (plural — maps
    every `list:<id>:<role>` ability to a `{listId, role}` entry) into a `grants` array per
    token. Never re-emits the secret — nothing to "hide later" since `DbAccessTokensProvider`
    never persists the plaintext, only the hash, so the creation response is structurally the
    only place it can ever appear.
  - `store`: validates `{ name, listIds: number[], role }`, dedupes `listIds`, then
    `Promise.all(listIds.map(id => ListPolicy.requireList(user, id, 'owner')))` — minting
    requires owning *every* requested list, not just one of them; a single non-owned or
    non-existent id fails the whole request (404/403, whichever `requireList` throws first) —
    then `User.personalAccessTokens.create(user, listIds.map(id => `list:${id}:${role}`), {
    name })`.
  - `destroy`: `User.personalAccessTokens.find(user, tokenId)` — already scoped to the calling
    user, so no list-ownership re-check is needed to revoke your own credential.
- `apps/api/app/validators/personal_access_token.ts` (new) — `{ name: string (1-100), listIds:
  number[] (min 1), role: 'editor' | 'viewer' }`.
- `apps/api/app/transformers/personal_access_token_transformer.ts` (new) — `{ id, name, grants:
  {listId, role}[], lastUsedAt, expiresAt, createdAt }`, no token field.
- `apps/api/start/routes.ts` — a new top-level `tokens` group (sibling to `account`/`folders`/
  `lists`/`stores`, not nested inside any of them):
  ```ts
  router.get('/', [controllers.PersonalAccessTokens, 'index'])
  router.post('/', [controllers.PersonalAccessTokens, 'store'])
  router.delete(':tokenId', [controllers.PersonalAccessTokens, 'destroy'])
  ```
  on the plain `api` guard only (login session) — a PAT can never satisfy `store`'s `'owner'`
  check anyway (its effective role is always capped at editor/viewer), so minting more PATs
  from a PAT is structurally blocked, not just a route-level choice.
- `apps/api/start/limiter.ts` (new, via `node ace configure @adonisjs/limiter` — database
  store, backed by a new `rate_limits` table/migration, SQLite so no Redis needed) — no rate
  limiting existed anywhere in the app before this. Exports `listsThrottle`, an
  `limiter.define('lists', ...)` HTTP limiter keyed on `ctx.auth.user.currentAccessToken`'s
  identifier (falling back to IP only if that's ever missing) rather than per-IP, so a runaway
  HA instance throttles only its own token's quota, not the interactive session sharing the
  same account. Applied in `routes.ts` to the `lists/:listId/*` group only (where a PAT
  actually reads/writes data) — the `tokens` management routes above aren't throttled, since
  they're driven by an interactive human occasionally minting/revoking, not an always-on
  integration.
- `packages/shared/src/domain.ts` — `AccessTokenGrantDto { listId, role }`, `AccessTokenDto {
  id, name, grants: AccessTokenGrantDto[], lastUsedAt, expiresAt, createdAt }`, and
  `AccessTokenCreatedDto extends AccessTokenDto` (adds `token: string`).
- `apps/web/src/lib/api/tokens.ts` (new) — `fetchTokens()`, `createToken(name, listIds, role)`,
  `revokeToken(tokenId)` via the shared `apiGet/apiPost/apiDelete` from `client.ts` — none of
  them list-scoped, matching the top-level route shape.
- `apps/web/src/routes/settings/tokens/+page.svelte` (+ `+page.ts` disabling prerender/SSR
  like `settings/sync`) — new page. Loads the user's lists and tokens together
  (`Promise.all([fetchLists(), fetchTokens()])`) rather than one driving the other, which
  avoids an error-clearing race that an earlier single-list draft of this page had (loading the
  second resource after the first would unconditionally clear `error` on the way out, wiping
  out a genuine failure). Creation form: name input, a **multi-select checkbox group over owned
  lists** (`flowbite-svelte`'s `Checkbox` bound via `group={newTokenListIds}`, the same idiom
  `lists/[id]/categories/import` uses to multi-select categories) + one role applied to every
  checked list, disabled until a name and at least one list are chosen. The list-picker inside
  the create form is a small departure from a plain `<select>`: a native `<option value={...}>`
  bound to reactive per-item data compiles, in Svelte 5, to a dirty-check branch (`option_value
  !== (option_value = ...)`) that can only be exercised by re-rendering the *same* `<option>`
  with a *changed* value — which never happens here, since the owned-lists array is fetched
  once and never mutates in place. That left one permanently-uncoverable branch under this
  repo's 100%-branch gate; switching to a `role="radiogroup"` of `<button>`s (already the
  pattern the parent `/settings` page uses for theme/accent/orientation) sidesteps it entirely
  and reads more consistently with the rest of the settings UI besides. Active-tokens list shows
  each token's name plus every granted list's name and role
  (`grant.listId` resolved against the fetched lists, falling back to `List #<id>` if a grant
  references a list that's since been deleted — the grant itself isn't cleaned up when a list
  is, though `ListPolicy` would 404 on it regardless).
- `apps/web/src/routes/settings/+page.svelte` — add an "Access Tokens" row under a new
  "Integrations" section, styled exactly like the existing "Sync status" row
  (`href={resolve('/settings/tokens')}`).

### Verification

- `apps/api/tests/functional/personal_access_tokens.spec.ts` (Japa, pattern from
  `list_invites.spec.ts`): owner can mint/revoke; non-owner (editor/viewer) cannot mint; a
  minted token authenticates against `GET/POST/PATCH/DELETE .../items` only for its granted
  list+role; **a minted token gets 404 (not 403) against a different list the same user
  genuinely owns** — write this test first, it's the regression test for the critical finding
  above.
- `c8`'s 100%-branch requirement (`apps/api/.c8rc.json`) forces every branch of the new
  PAT-intersection logic to be exercised.
- Manual smoke against a throwaway local dev DB (`pnpm dev`), never against prod directly —
  mint a token via curl, confirm scoping, discard the DB.
- `pnpm check` before considering this stage done.

---

## Stage 1 — Home Assistant integration

### Design

New public repo (separate from the monorepo, per the HACS constraint above — e.g.
`everylist-hass`), a HACS custom integration exposing each EveryList list as a native
`todo.*` entity via `TodoListEntity`. HA's Voice Assist already understands todo-domain
add/complete intents out of the box, so this needs no custom NLU:

```
custom_components/everylist/
  __init__.py       entry setup/unload
  manifest.json      domain "everylist"
  config_flow.py     prompts for base URL + PAT, validates with one API call
  todo.py             TodoListEntity implementation
  api.py               thin aiohttp client
  const.py
tests/                pytest + pytest-homeassistant-custom-component
.github/workflows/ci.yml
hacs.json
```

This repo holds itself to the same bar as the monorepo, not a lighter one: `pytest-cov` with a
100%-coverage gate (mirroring `apps/api`'s `c8` philosophy) and a `.github/workflows/ci.yml`
that runs lint + the coverage-gated test suite on every PR — set this up alongside the
integration code, not as an afterthought once tests already exist.

- `async_get_todo_items` → `GET /lists/:listId/items`.
- `async_create_todo_item` → fuzzy-match against `GET .../items/recent-names` first
  (`difflib.get_close_matches`, stdlib, no new dep) to catch near-miss transcriptions ("miilk"
  vs "milk") before calling `POST .../items` — the API's own exact-match dedup
  (`LOWER(TRIM(name))`, confirmed in `apps/api/app/controllers/items_controller.ts:148-151`)
  only catches exact repeats, not fuzzy ones.
- `async_update_todo_item` / `async_delete_todo_item` → `PATCH`/`DELETE .../items/:itemId`,
  honoring the existing `expectedVersion`/409-conflict pattern (`hasVersionConflict`/
  `response.conflict()` in `items_controller.ts`) — on a 409, refetch and retry once rather
  than surfacing a raw error to Voice Assist.
- Realtime: subscribe to `list/{listId}` via Transmit's `__transmit/subscribe`
  (`apps/api/start/transmit.ts`) so the entity reflects changes made elsewhere without
  polling; fall back to a periodic poll as a safety net if the SSE connection drops.
- Auth: config flow asks for base URL + a Stage-0 PAT (editor role, scoped to the list(s) to
  expose). A revoked/expired token should trigger HA's reauth flow
  (`config_entries.SOURCE_REAUTH`), not a silently-broken entity.

### Sequencing

Hard dependency on Stage 0. No dependency on Stage 2 — ships and is usable standalone.

### Verification

- `pytest` + `pytest-homeassistant-custom-component` (standard HACS testing pattern) with
  `pytest-cov` enforcing 100% coverage, run via the repo's own `.github/workflows/ci.yml` on
  every PR — a separate gate from EveryList's own CI, but held to the same bar, set up from
  the start rather than bolted on later.
- End-to-end: add the local dev checkout as a custom HACS repository against a scratch HA
  instance, pointed at the same throwaway local EveryList dev DB used in Stage 0. Confirm:
  "add milk" creates an item, "mark milk as done" completes it, an item added from the phone
  app shows up in HA without user action.
- First real rollout against prod: mint a fresh, single-list PAT specifically for this, so a
  bug in the integration can only affect that one list, and confirm revoking it from
  `/settings/tokens` actually kills HA's access before trusting it unattended.

---

## Stage 2 — Alexa custom skill

### Design

Stays in the monorepo (`apps/api`) — unlike HACS, Alexa doesn't pull code from a repo, so
there's no structural reason to split it out.

- **No Lambda.** Alexa custom skills accept a direct HTTPS endpoint if it has a CA-trusted
  cert (the Cloudflare-tunneled instance already does). Trade-off accepted: the endpoint must
  self-verify Alexa's request signature (the `alexa-verifier` npm package fits the
  Node/AdonisJS stack) instead of getting Lambda's free IAM-based check. `alexa/README.md`
  must explain this in plain English for a self-hoster deciding whether they can use this at
  all: what a CA-trusted cert is and why a self-signed one won't work, that the Cloudflare
  tunnel (or equivalent reverse proxy) satisfies it, and that there's no AWS account/Lambda
  deploy step required — this is the first thing someone evaluating the skill needs to know,
  not an implementation detail buried later in the doc.
- **Account linking reuses Stage 0, not a second auth system, and Authentik is a hard
  requirement, not one option among several.** Authentik (already the household's IdP,
  already fronted by SWAG) becomes the skill's OAuth2 provider — carve out only its
  `/authorize` and `/token` endpoints from SWAG's forward-auth (everything else stays
  protected, as today; this is a SWAG/Authentik config change, not application code). On
  successful auth-code exchange, mint a Stage-0 PAT server-side (scoped to the user's list(s),
  editor role) and hand its value back as the OAuth2 access token — this is the one open
  design point worth a quick spike before committing, since it's the one place two systems
  (Authentik's OAuth flow and EveryList's own PAT machinery) have to be wired together, but
  reusing Stage 0 wholesale (rather than inventing a second token-verification path in the
  `api` guard) is the working assumption and the right one given Stage 0 already handles
  scoping, revocation, and throttling. **`alexa/README.md` must state up front, before any
  setup steps, that Authentik is required for account linking as built** — this is not a
  generic "bring your own OIDC provider" integration. Other OIDC/OAuth2 IdPs (Authelia,
  Keycloak, etc.) may work if they expose an equivalent authorization-code flow, but nothing
  is built or tested against them, so don't imply support — say plainly that they're untested
  and the setup steps assume Authentik.
- **Target: a private skill under the user's own Alexa developer account** (≤100 users, no
  store certification needed) pointed at the user's own instance — this is what gets built.
  The alternative "one shared certified skill + per-instance OAuth redirect" pattern (how
  Nabu Casa does it for HA Cloud) is worth documenting as a future path *if* other
  self-hosters want this, but is explicitly out of scope for this phase.
- **Intents, built to a real-use bar**
  (`apps/api/app/services/alexa/intent_router.ts`): `AddItemIntent`,
  `RemoveItemIntent`/`CompleteItemIntent`, and a read-back intent ("what's on my list" →
  spoken summary, not a full read of a long list), each taking an `ItemName` slot and
  optional `ListName` slot.
- **Which list**: a new `apps/api/app/services/alexa/list_resolution.ts` — explicit
  `ListName` slot fuzzy-matched against `GET /lists`; no slot + exactly one accessible list →
  use it; no slot + multiple lists → ask a disambiguating question rather than guessing. This
  logic doesn't exist anywhere in the app today and is Alexa-specific.
- **Item matching**: same fuzzy-match-before-mutate approach as Stage 1, against active items
  for remove/complete and against `recent-names` for add.
- **Failure handling**: given the single-process/single-SQLite-file deployment with no
  failover, a request landing mid-restart just fails — return a fast, honest spoken error
  ("EveryList isn't reachable right now") and let Alexa's normal per-utterance retry handle
  it. No request queue/outbox — that's solving a problem the deployment model doesn't have.

### Files

- `apps/api/app/controllers/alexa_controller.ts` (new) — handles
  `LaunchRequest`/`IntentRequest`/`SessionEndedRequest`.
- `apps/api/app/middleware/alexa_signature_middleware.ts` (new) — wraps `alexa-verifier`;
  must run against the raw request body before any parsing that would invalidate the
  signature.
- `apps/api/app/services/alexa/intent_router.ts`, `list_resolution.ts` (new).
- `apps/api/start/routes.ts` — new route outside the PAT-bearer `lists/:listId` group, e.g.
  `router.post('alexa', [controllers.Alexa, 'handle']).use(middleware.alexaSignature())`.
- `alexa/interaction-model.json`, `alexa/skill.json` (new, monorepo root or `alexa/`) —
  deployed via `ask-cli`, not the AdonisJS app.
- `alexa/README.md` (new) — leads with the two plain-English requirements above (no
  Lambda/needs a real cert; Authentik required for linking) before any setup instructions,
  then walks through the SWAG/Authentik config change and skill setup.

### Sequencing

Depends on Stage 0 (reuses PAT minting for linking). Does not depend on Stage 1 — the two
stages share only the PAT primitive, so Stage 2's backend work can start as soon as Stage 0
ships, in parallel with Stage 1's separate-repo work if desired. Given the household's stated
priority (Alexa used more day to day), it's reasonable to pull Stage 2 forward if Stage 1
stalls on anything HA-specific.

### Verification

- `apps/api/tests/functional/alexa.spec.ts` — subject to the same 100%-coverage gate as the
  rest of `apps/api`. Mock `alexa-verifier` itself (real signature verification is
  impractical to test end-to-end in Japa) and test against Amazon's published sample Alexa
  request-body fixtures: signature-middleware rejection of a bad/stale request, each intent's
  happy path, multi-list disambiguation, list-not-scoped path.
- Alexa's developer console has a built-in text/voice simulator that works against a
  `development`-state skill with no certification needed — use it against the dev endpoint
  first, then re-point at prod only once satisfied, with a narrowly-scoped linking PAT (same
  discipline as Stage 1).
- Because Alexa must reach a real public HTTPS endpoint, some verification is unavoidably
  against the real Cloudflare-tunneled URL — call this out as this stage's one true "no
  staging environment" risk, mitigated by keeping the skill private/personal-account-only and
  the linking PAT narrowly scoped.
