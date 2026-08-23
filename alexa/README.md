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

**3. If your EveryList instance sits behind forward-auth (SWAG + Authentik, Authelia, etc.)
covering the whole domain, two paths must bypass it.** This is easy to miss: forward-auth over
the whole domain only "works" for the web app today because your browser already carries a
session cookie. Alexa's servers call EveryList directly with no browser and no cookie, so
`POST /api/v1/alexa` and `POST /api/v1/alexa/oauth/token` need to reach AdonisJS unauthenticated
by the proxy — each authenticates the caller itself (Alexa's request signature, and the
account-linking client credentials, respectively). See step 2 below.

If any of those isn't true for your setup, this skill isn't a fit yet.

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

Authentik itself normally sits behind nothing (it can't front its own login check), so its
`/authorize`/`/token`/`/userinfo` endpoints are already reachable directly — no proxy change on
Authentik's side.

### 2. Carve out EveryList's two Alexa endpoints from forward-auth

**This step is easy to miss and the skill will not work without it if your EveryList instance is
itself behind SWAG (or another reverse proxy) with forward-auth covering the whole domain.**
Forward-auth in that setup only "works" for the web app today because your browser already
carries a valid Authentik session cookie on every request — Alexa's servers never will, since
they call EveryList directly, server-to-server, with no browser and no cookie. Two paths need to
bypass forward-auth entirely (everything else on the domain stays protected exactly as today —
each of these two endpoints authenticates the caller itself, so nothing is left unauthenticated):

- `POST /api/v1/alexa` — verified by Alexa's own request signature
  (`alexa_signature_middleware.ts`), not a session.
- `POST /api/v1/alexa/oauth/token` — verified by the account-linking client credentials Amazon
  presents (`alexa_oauth_controller.ts`), not a session.

In SWAG's nginx config for your EveryList site (adapt the upstream/proxy directives to whatever
your existing site conf already uses — the key part is that these two `location` blocks must
appear *before* the general `location /` block that includes the forward-auth snippet, and must
not include that snippet themselves):

```nginx
location = /api/v1/alexa {
    include /config/nginx/proxy.conf;
    proxy_pass http://<your-everylist-upstream>;
}

location = /api/v1/alexa/oauth/token {
    include /config/nginx/proxy.conf;
    proxy_pass http://<your-everylist-upstream>;
}

location / {
    include /config/nginx/authentik-server.conf;  # or whatever your forward-auth include is called
    proxy_pass http://<your-everylist-upstream>;
    ...
}
```

Reload nginx, then confirm both paths are actually reachable without a session before touching
the Alexa console — a plain `curl -i https://your-everylist-domain/api/v1/alexa` should come back
from AdonisJS (a 400 "Missing Alexa request signature headers" JSON body is correct — that means
the request reached the app) rather than an HTML redirect to Authentik's login page.

### 4. Configure EveryList's environment

Set these on your EveryList API container/process (see `.env.example`):

```bash
AUTHENTIK_TOKEN_URL=https://your-authentik-domain/application/o/token/
AUTHENTIK_USERINFO_URL=https://your-authentik-domain/application/o/userinfo/
AUTHENTIK_CLIENT_ID=<the client id from step 1>
AUTHENTIK_CLIENT_SECRET=<the client secret from step 1>

# Optional but recommended once you have a skill id (step 5):
ALEXA_SKILL_ID=<your skill's application id>
```

All of these are optional — with none of them set, the skill endpoint responds to every request
by asking Alexa to prompt for account linking, and the app otherwise boots and runs normally.

### 5. Create the skill in the Alexa developer console

Using your own Amazon developer account. Account Linking (sub-step 4 below) is where Alexa shows
you its own redirect URI — if you didn't already add it to the Authentik provider in step 1,
come back and add it there once you see it here (Authentik lets you edit a provider's redirect
URIs any time).

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
   skill's "Endpoint" page, and set it as `ALEXA_SKILL_ID` (step 4) — the skill endpoint checks
   this on every request as defense-in-depth alongside Amazon's request-signature verification.
6. Test in the console's **Test** tab (enable testing for the "Development" stage) before
   touching a real Echo device — the built-in simulator sends real signed requests to your
   endpoint without needing certification, and its **Display** panel renders the APL visual list
   (PHASE16_PLAN.md Stage 3) so you can check the on-screen layout and tap-to-complete there too.

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

## Screen devices (Echo Show/Hub)

On a device with a screen — the household's Echo Hub, an Echo Show, etc. — this skill shows the
list visually as well as speaking, using [APL](https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/apl-overview.html).
This is automatic; there's nothing extra to configure per device.

- **Opening the skill opens the list.** "Alexa, open every list" shows your list on-screen
  immediately (the single accessible list, or a prompt asking which one if you have several)
  instead of just a spoken welcome — which is what happens instead on a screen-less device like
  an Echo Dot.
- **The screen stays current.** Adding, removing, or completing an item by voice — or asking
  "what's on my list" — re-renders the display with the current state, grouped by category the
  same way the EveryList app itself groups a list, with checked items shown struck through
  rather than hidden.
- **Tap an item to check or uncheck it.** No voice needed for that — tapping toggles the item
  straight on EveryList, respecting the same `editor`-role check a voice command would (a
  `viewer`-linked token can look but not tap-to-toggle).
- **Looks like the app.** The list/category icons and colors match the EveryList app's own —
  rendered on the fly as PNGs by a small, unauthenticated icon endpoint
  (`/api/v1/alexa/icons/:name`) the Alexa display fetches directly, since APL can't render the
  app's SVG icon library itself.
- This is declared via the `ALEXA_PRESENTATION_APL` interface already checked into
  [`skill.json`](skill.json) — deploying that file (console paste or `ask deploy`) is all that's
  needed; there's no separate document/widget resource to register.
- **This can only be verified by actually looking at it.** The Alexa Developer Console's **Test**
  tab renders APL visually (not just the text/voice transcript) for a `development`-stage skill,
  so check the layout and the tap-to-complete behavior there before trusting it on the real Echo
  Hub — spacing, colors, and whether checked items render as struck-through the way intended are
  all things this repo's own test suite can exercise the *data* for, but never the actual pixels.

## Troubleshooting

- **"Please link your EveryList account" every time, even after linking**: check that the PAT
  named "Alexa" still exists under Settings → Access Tokens — it may have been revoked, or the
  linked account's email doesn't match any EveryList user.
- **Alexa's console reports a certificate error**: your endpoint's certificate isn't from a CA
  Alexa trusts, or the certificate chain is incomplete — check with `openssl s_client -connect
  your-domain:443 -showcerts`.
- **Screen device shows speech but no visual list, or the interaction ends with "The device does
  not support Alexa.Presentation.APL directives"**: the `ALEXA_PRESENTATION_APL` interface isn't
  enabled for the skill in the Developer Console (Build → Interfaces) — enable it there. Don't
  rely on `context.Viewports` in a request to mean the device can render one: a real Echo Hub can
  report a `Viewports` entry with `type: "APL"` while its `System.device.supportedInterfaces` is
  still empty and the platform rejects the directive outright — `supportedInterfaces` is the only
  signal `alexa_controller.ts` trusts.
- **Account linking fails at the Authentik step**: confirm the redirect URI registered in
  Authentik matches exactly what the Alexa developer console shows (including trailing slashes).
- **Every request gets "Please link your EveryList account" / the Alexa Test tab shows a
  connection or auth error, and you're behind SWAG-style forward-auth**: confirm `POST
  /api/v1/alexa` and `POST /api/v1/alexa/oauth/token` actually bypass forward-auth (step 2) —
  `curl -i` either path and check you get a plain JSON response from AdonisJS, not an HTML
  redirect to Authentik's login page. This is the single most common way this skill silently
  fails to work at all on a forward-auth-protected instance.
- There is no staging environment for the skill endpoint itself: since Alexa must reach a real
  public HTTPS endpoint, some verification is unavoidably against your real instance. Keep the
  skill private/personal-account-only and use a narrowly-scoped test account while validating.
