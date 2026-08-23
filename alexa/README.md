# EveryList Alexa skill

A private Alexa custom skill for your own self-hosted EveryList instance. Say "Alexa, ask every
list to add milk," "Alexa, tell every list I got eggs," or "Alexa, ask every list what's on my
list."

## Before you start: two hard requirements

**1. No Lambda — but you need a real, CA-trusted HTTPS certificate.** Alexa custom skills accept
a direct HTTPS endpoint (no AWS account, no Lambda deploy) as long as that endpoint has a
certificate issued by a trusted CA. A self-signed certificate will not work — Alexa validates the
certificate chain on every request. If your EveryList instance is already reachable through a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(or any reverse proxy that terminates a real Let's Encrypt/CA cert), you already satisfy this and
there is nothing else to set up on that front.

**2. Account linking requires [Authentik](https://goauthentik.io/).** This skill doesn't invent
its own login flow for Alexa — it reuses your household's existing Authentik instance as the
OAuth2 provider for account linking. This is not a generic "bring your own OIDC provider"
integration: the setup steps below are written specifically for Authentik, and nothing here has
been built or tested against another IdP (Authelia, Keycloak, etc.), even though one exposing an
equivalent authorization-code flow might work. If you don't run Authentik in front of EveryList
today, set that up first.

If either of those isn't true for your setup, this skill isn't a fit yet.

## How account linking works

Alexa's own account-linking config only has room for **one** OAuth2 client id/secret pair. That
same pair is used twice: once when Alexa redirects your phone's browser straight to Authentik's
`/authorize` endpoint, and again when Alexa's servers call EveryList's own token-bridge endpoint
to redeem the resulting code. Concretely:

1. You link your account in the Alexa app. Alexa opens Authentik's `/authorize` page and you log
   in there, same as anywhere else Authentik fronts a login.
2. Authentik redirects back to Alexa with an authorization code.
3. Alexa calls **EveryList's** `POST /api/v1/alexa/oauth/token` (not Authentik's own token
   endpoint) with that code, authenticating itself with the client id/secret from step 1.
4. EveryList's server exchanges that same code with Authentik's real token endpoint, then calls
   Authentik's userinfo endpoint to learn your email address.
5. EveryList looks up the matching EveryList account by that email, and mints a Stage-16
   [Personal Access Token](../foundational/PHASE16_PLAN.md) scoped to every list you're a member
   of (capped at the `editor` role — same ceiling the Settings → Access Tokens page enforces).
   That PAT's value is handed back to Alexa as its OAuth2 "access token."
6. Every subsequent Alexa request for your account carries that PAT, which EveryList verifies the
   same way it verifies any other Personal Access Token.

Re-linking the skill mints a fresh PAT each time — old ones aren't automatically revoked. If you
ever want to cut off Alexa's access, revoke the token named "Alexa" from **Settings → Access
Tokens** in the EveryList web app; that takes effect immediately, no re-deploy needed.

## Setup

### 1. Register a client in Authentik

In Authentik, create a new **OAuth2/OpenID Provider**:

- **Client type**: Confidential
- **Redirect URIs**: the redirect URI Alexa's account-linking page shows you when you fill in the
  Authorization URI below (it's `https://layla.amazon.com/api/skill/link/<your-vendor-id>`, or the
  region-specific equivalent — the Alexa developer console shows you the exact value to copy).
- **Scopes**: `openid`, `email` (this skill only ever asks for your email address)

Note the provider's:
- Authorization URL (`.../application/o/authorize/`)
- Token URL (`.../application/o/token/`)
- Userinfo URL (`.../application/o/userinfo/`)
- Client ID and Client Secret

If SWAG (or another reverse proxy) fronts Authentik with forward-auth protecting everything by
default, carve out `/application/o/authorize/` and `/application/o/token/` (and `/userinfo/`) so
Alexa's servers and your phone's browser can reach them directly — everything else stays behind
forward-auth exactly as it is today. This is a proxy/Authentik config change only; no EveryList
application code is involved.

### 2. Configure EveryList's environment

Set these on your EveryList API container/process (see `.env.example`):

```bash
AUTHENTIK_TOKEN_URL=https://your-authentik-domain/application/o/token/
AUTHENTIK_USERINFO_URL=https://your-authentik-domain/application/o/userinfo/
AUTHENTIK_CLIENT_ID=<the client id from step 1>
AUTHENTIK_CLIENT_SECRET=<the client secret from step 1>

# Optional but recommended once you have a skill id (step 3):
ALEXA_SKILL_ID=<your skill's application id>
```

All of these are optional — with none of them set, the skill endpoint responds to every request
by asking Alexa to prompt for account linking, and the app otherwise boots and runs normally.

### 3. Create the skill in the Alexa developer console

Using your own Amazon developer account:

1. Create a new custom skill, English (or your locale). Choose **Provision your own** for hosting
   (this is what lets you skip Lambda).
2. **Interaction model**: paste [`interaction-model.json`](interaction-model.json) into the JSON
   editor, or `ask deploy` it with `ask-cli` (see below).
3. **Endpoint**: HTTPS, pointed at `https://your-everylist-domain/api/v1/alexa`. Choose "My
   development endpoint is a sub-domain of a domain that has a wildcard certificate from a
   certificate authority" or the plain CA-signed-cert option, matching how your reverse proxy is
   set up.
4. **Account Linking**: turn it on and fill in:
   - Authorization URI: Authentik's authorize URL from step 1
   - Access Token URI: `https://your-everylist-domain/api/v1/alexa/oauth/token`
   - Client ID / Client Secret: the **same** Authentik client id/secret from step 1 — see "How
     account linking works" above for why there's only one pair
   - Client Authentication Scheme: **HTTP Basic**
   - Scope: `openid`, `email`
   - Domain list: leave empty unless the console requires an entry
   ([`account-linking.json`](account-linking.json) has this as a ready-made template)
5. Note the skill's **Application ID** (looks like `amzn1.ask.skill.xxxxxxxx`) shown on the
   skill's "Endpoint" page, and set it as `ALEXA_SKILL_ID` (step 2) — the skill endpoint checks
   this on every request as defense-in-depth alongside Amazon's request-signature verification.
6. Test in the console's **Test** tab (enable testing for the "Development" stage) before
   touching a real Echo device — the built-in simulator sends real signed requests to your
   endpoint without needing certification.

### Deploying with `ask-cli` instead of the console

If you'd rather manage this skill as code:

```bash
npm install -g ask-cli
ask configure   # logs in with your Amazon developer account
```

Then either `ask deploy` from an `ask-cli`-initialized project pointing at this `alexa/` directory
(`skill.json`, `interaction-model.json`, `account-linking.json`), or use
`ask smapi update-account-linking-info-v2` for the account-linking piece specifically. Replace the
`REPLACE_WITH_*` placeholders in `account-linking.json` before deploying — `ask-cli` does not read
these from your EveryList `.env`.

## Scope

This is a **private skill under your own developer account** (≤100 users, no store certification
needed), pointed at your own instance. A shared, certified skill that any self-hoster could link
against their own instance (the way Nabu Casa/Home Assistant Cloud does it) is a reasonable future
path, but nothing here supports it — this skill hard-codes the assumption that it's talking to one
instance, run by whoever set it up.

## What voice control can do

| Say something like...                          | Intent                |
| ------------------------------------------------ | ---------------------- |
| "add milk", "add milk to the groceries list"    | `AddItemIntent`        |
| "remove milk", "take milk off my list"          | `RemoveItemIntent`     |
| "I got milk", "mark milk as done"               | `CompleteItemIntent`   |
| "what's on my list", "what's on the groceries list" | `ReadListIntent`   |

If you have more than one list and don't name one, Alexa asks which list you meant. Item and list
names tolerate near-miss transcriptions ("miilk" still matches "Milk"). A token linked with
`viewer`-only access to a list can hear what's on it but can't add, remove, or complete items on
it.

## Troubleshooting

- **"Please link your EveryList account" every time, even after linking**: check that the PAT
  named "Alexa" still exists under Settings → Access Tokens — it may have been revoked, or the
  linked account's email doesn't match any EveryList user.
- **Alexa's console reports a certificate error**: your endpoint's certificate isn't from a CA
  Alexa trusts, or the certificate chain is incomplete — check with `openssl s_client -connect
  your-domain:443 -showcerts`.
- **Account linking fails at the Authentik step**: confirm the redirect URI registered in
  Authentik matches exactly what the Alexa developer console shows (including trailing slashes),
  and that SWAG/your reverse proxy isn't still forward-auth-protecting Authentik's `/authorize` or
  `/token` endpoints.
- There is no staging environment for the skill endpoint itself: since Alexa must reach a real
  public HTTPS endpoint, some verification is unavoidably against your real instance. Keep the
  skill private/personal-account-only and use a narrowly-scoped test account while validating.
