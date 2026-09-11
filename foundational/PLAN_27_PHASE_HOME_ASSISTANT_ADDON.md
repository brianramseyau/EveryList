# Phase 27 — Home Assistant Add-on

## Context

EveryList already ships as a single self-contained Docker image
(`ghcr.io/brianramseyau/everylist`, multi-arch amd64+arm64, s6-overlay init,
SQLite under `/config`), with an Unraid Community Applications template
(`docker/unraid-template.xml`) as the existing prior art for translating the
image's env vars into a host-specific config UI. This phase adds the same
kind of front door for Home Assistant OS/Supervised users: an Add-on
manifest that lists EveryList in the Add-on Store and runs the
already-published image directly — no new Dockerfile, no new CI build, no
rebuild-on-device.

This is a manifest-only addition, not a new deployment target requiring new
application code — the one piece of new runtime behavior
(`docker/root/etc/cont-init.d/05-ha-options`) is gated on a path
(`/data/options.json`) that only exists under Supervisor, so it's a no-op
for every existing Docker/Compose/Unraid deployment.

Kept in this monorepo rather than split into a separate repo (unlike
`everylist-hass`, the HACS integration): that split was forced by HACS
requiring `custom_components/<domain>/` at repo root, which doesn't apply
to HA add-on repos (just a `repository.yaml` + subfolder, anywhere). Splitting
here would only add cross-repo release/versioning overhead for no benefit —
confirmed by wanting the add-on's `version:` kept in lockstep with each
release automatically (see below), which is a plain in-repo commit with the
default `GITHUB_TOKEN` and would otherwise need a PAT with write access to
a second repo.

Deliberately deferred out of v1 (Ingress landed in a follow-up — see
"Ingress support" below):
- **PUID/PGID exposure** — meaningful for Unraid/LSIO-style host bind
  mounts, not for Supervisor-managed `addon_config` volumes. Left at the
  image's baked-in defaults (99:100), not surfaced as an add-on option.

## Add-on manifest

New: `repository.yaml` (repo root) + `ha-addon/everylist/` —

- `ha-addon/everylist/config.yaml` — `image: ghcr.io/brianramseyau/everylist`
  (Supervisor pulls the existing published image, no local build);
  `arch: [amd64, aarch64]` (matches what the Dockerfile itself supports —
  it hard-exits on any other `dpkg --print-architecture`); `init: false`
  (the image already has its own s6-overlay `ENTRYPOINT ["/init"]` — letting
  Supervisor wrap it in its own init as well is the classic gotcha for any
  LSIO-style image ported to a HA add-on); `map: [{ type: addon_config, path:
  /config, read_only: false }]` — the modern object form, **not** the legacy
  `config:rw` shorthand, which maps to Home Assistant's own config directory
  (`automations.yaml` etc.), not a private per-addon folder; `ports: {
  3000/tcp: 3000 }` + `webui: http://[HOST]:[PORT:3000]/`, same pattern as
  the Unraid template's `WebUI` field.
- `options`/`schema` — deliberately minimal: `app_url` (optional str) and
  `app_key` (optional password, masked). Everything else the Unraid template
  exposes (public signups, SMTP, Alexa linking) is already covered by
  EveryList's own in-app **Settings → Server settings** UI
  (`/config/config.yaml`) once the container is up, so it isn't duplicated
  as an add-on option.
- `icon.png` — reused from `branding/icon-192.png`.
- `DOCS.md` — setup + options reference for the Add-on Store's
  Documentation tab.

## Options → env wiring

Supervisor writes add-on options to `/data/options.json` inside the
container; it does not map them to env vars itself for an `image:`-based
add-on with no addon-local Dockerfile. New:
`docker/root/etc/cont-init.d/05-ha-options` — an s6-overlay cont-init script,
ordered before `20-app-key`/`30-migrate` (lexical order), that:
- Exits immediately if `/data/options.json` doesn't exist (true for every
  non-Supervisor deployment).
- Reads `app_url`/`app_key` with `jq` and, if set, persists them for later
  scripts/services the same way `20-app-key` already persists a generated
  `APP_KEY` — writing to `/var/run/s6/container_environment/<NAME>`.

`jq` was added to the release image's `apt-get install` list (it's not
purged alongside `curl`/`xz-utils`, which are build-time-only) since this
script needs it at runtime.

## Automated version bump

`.github/workflows/docker-publish.yml` gets a new job,
`bump-addon-version`, after `merge`, gated to stable release tags only
(`startsWith(github.ref, 'refs/tags/v') && !contains(github.ref, '-')` —
matches the same rule the `latest`/`vX` image tags already use, so the
add-on never tracks a prerelease). It checks out `main`, `sed`s
`ha-addon/everylist/config.yaml`'s `version:` to the tag, and commits with
`stefanzweifel/git-auto-commit-action` using the default `GITHUB_TOKEN`.

Two things confirmed before landing this, both because a bot commit pushed
straight to `main` needed to be provably safe with zero manual follow-up:
- **No rebuild loop**: this workflow also triggers on every push to `main`,
  so the bot's own commit lands there too — but GitHub Actions deliberately
  does not trigger further workflow runs for commits pushed with the
  default `GITHUB_TOKEN` (standard loop-prevention behavior), so this push
  is silent — no second `docker-publish.yml` run, no extra `nightly`
  rebuild.
- **No branch-protection conflict**: checked via
  `gh api repos/brianramseyau/EveryList/branches/main/protection` — `main`
  only has `required_status_checks` (a PR-merge gate, doesn't block raw
  pushes) and `allow_deletions: false`; there's no
  `required_pull_request_reviews` rule at all, so the direct commit isn't
  blocked and needs no bypass-list/ruleset change or PR-based fallback.

## README updates

New "Home Assistant" subsection under "Getting started" (README.md), with
the standard **My Home Assistant** one-click badge
(`my.home-assistant.io/badges/supervisor_add_addon_repository.svg` +
matching `/redirect/supervisor_add_addon_repository/?repository_url=...`
link) so a user can add this repo as an add-on repository without typing a
URL. The monorepo layout tree also gets a `ha-addon/` entry, and the
existing HACS-integration callout is clarified to distinguish it (a
`todo.*` entity client against an already-running EveryList server) from
this add-on (runs the server itself).

## Verification

1. Stand up a Home Assistant OS test instance (VM or Raspberry Pi) or the
   `homeassistant/amd64-hassio-supervisor` dev environment, add this repo's
   URL under Add-on Store → repositories, install "EveryList", confirm:
   - Container starts, migrations run, SQLite persists under the add-on's
     private `/addon_configs/<slug>` host path (confirms the
     `addon_config` map, not HA's own config dir, is in use).
   - `webui` link opens the app and it's fully usable end-to-end.
   - Setting `app_url`/`app_key` before first start takes effect
     (`/api/v1/meta`, and `APP_KEY` doesn't regenerate on restart).
   - Restart/update doesn't wipe data.
2. Cut a test prerelease tag (`vX.Y.Z-beta.1`) — confirm
   `bump-addon-version` is skipped; cut a real `vX.Y.Z` tag — confirm
   `config.yaml`'s `version:` updates via a plain commit on `main`, no PR.

## Post-review fixes (live-instance testing, PR #224)

- `config.yaml`'s placeholder `version: "0.0.0"` and the `bump-addon-version`
  job's `${GITHUB_REF_NAME#v}` both stripped or never matched the "v" prefix
  that's actually part of every published GHCR tag (`vX.Y.Z`, not `X.Y.Z`).
  Supervisor pulls `ghcr.io/brianramseyau/everylist:<version>` verbatim — an
  `image:`-based add-on's `version:` isn't a display string, it's the literal
  Docker tag — so `0.0.0` 404'd on install. Fixed: placeholder set to the
  actual latest published tag (`v1.4.0`), the CI job keeps the "v" prefix,
  and `config.yaml` now carries a comment explaining why, so this doesn't
  regress on a future edit.

## Ingress support

The plain-port `webui` link 404'd against the user's real setup: their
reverse proxy fronts Home Assistant's own domain only, the same way every
other Ingress add-on they run (e.g. AdGuard) already works, and had no
route for EveryList's separate host port. Verified with an Explore agent
against `apps/web`/`apps/api` before touching anything, since Ingress had
been deferred specifically because this wasn't yet known to be safe:

- Supervisor's ingress proxy strips its per-install, random token path
  prefix (`/api/hassio_ingress/<token>/...`) before forwarding to the
  container, so the *server* never needs to know about it — but the
  browser resolves any **root-absolute** URL the app emits
  (`/api/v1/...`, `/_app/...`, the PWA manifest, service worker scope)
  against the real page URL, bypassing that prefix and 404ing.
- EveryList is root-absolute almost everywhere: every API call funnels
  through `apps/web/src/lib/api/base-url.ts`'s `apiBaseUrl()` with a
  literal `/api/v1/...` path; `apps/web/vite.config.ts` sets
  adapter-static's `paths.relative: false` **deliberately**, for
  Capacitor's native WebView SPA fallback — not touched here, since
  flipping it back risks reintroducing that native-app bug; the PWA
  manifest/Workbox config (`apps/web/pwa.config.mjs`) is root-absolute
  too.
- `apps/api/start/routes.ts`'s SPA-fallback wildcard route is the *only*
  HTML response with a server-side hook at all — prerendered pages are
  served directly by `@adonisjs/static` (runs before routing, no
  per-request customization). A static build has no way to bake a
  runtime-only ingress token into an arbitrary prerendered page, so the
  fix has to control *which* URL the Ingress iframe ever loads, not
  rewrite arbitrary pages.

**Implementation**: `ha-addon/everylist/config.yaml` sets `ingress: true`,
`ingress_port: 3000`, `ingress_entry: /ha-ingress-entry` — see "Fixing
Ingress for real" below for why that's a real, deliberately
non-prerendered route rather than a made-up path, so it always falls
through to the wildcard route instead of being served as a static file.
`apps/api/start/routes.ts`'s wildcard route now checks for the
`x-ingress-path` request header (verify the exact header name against
current HA developer docs if this ever needs revisiting — an external,
evolving contract); when present, `#services/ingress_service`'s
`rewriteHtmlForIngress()` rewrites every root-absolute `src="/`/`href="/`
in `200.html` to be prefixed, and injects
`window.__EVERYLIST_INGRESS_BASE__ = "<prefix>";` as the first thing in
`<head>`. No header → today's exact `response.download()` behavior,
byte-for-byte; every other route is untouched.

On the frontend, `apps/web/src/lib/api/ingress.ts` (`ingressBase()`,
`isIngress()`) reads that global. `base-url.ts`'s `apiBaseUrl()` checks it
ahead of the existing native `getServerUrl()` source — since every
API/realtime/push call already funnels through that one function, this
single change covers every call site with no literal-path hunting.
`+layout.svelte` skips Service Worker registration and the PWA install
prompt entirely under ingress (same signal, same file) — "install as a
PWA" pointed at a rotating per-install token URL isn't coherent, so this
sidesteps the SW-scope/manifest-prefix problem rather than solving it.

**Known, accepted limitation**: SvelteKit's client-side router
(`resolve()`/`goto()` — confirmed no raw `goto('/...')` literals anywhere)
bakes its `base` in at build time, so a hard refresh or a direct deep link
to a sub-page while inside the Ingress iframe still lands outside the
proxy prefix and 404s. Everything after the first load runs client-side
with no further server round-trip, so this only matters on an explicit
refresh — reopening the add-on from Home Assistant always returns to a
working state. Documented in `ha-addon/everylist/DOCS.md`, not left as a
silent surprise.

**Tests**: `apps/api/tests/unit/ingress_service.spec.ts` (the pure
rewrite function — prefixing, global injection, `<head>` with attributes,
protocol-relative/external/already-relative URLs left untouched, no
`<head>` at all as a defensive fallback) and
`apps/api/tests/functional/spa_fallback.spec.ts` (the route: no header →
unchanged, header → rewritten + correct content-type, `/api/*` still
404s as JSON either way). `apps/web/src/lib/api/ingress.spec.ts` +
`ingress.svelte.spec.ts` (no-window guard + real-browser global) and an
updated `base-url.spec.ts` (ingress source takes priority over native).
`+layout.svelte` itself is excluded from the web coverage gate (framework
glue, per `vite.config.ts`), so its SW/install-prompt skip isn't unit
tested — covered by the live-instance verification below instead.

**Post-review fix (CI, this PR)**: the first version of
`spa_fallback.spec.ts` called `client.get(...)` against
`app.publicPath('200.html')` without creating it, passing locally only
because a stray, untracked `apps/api/public/200.html` happened to already
exist on disk from an earlier unrelated local build — `apps/api/.gitignore`
excludes everything under `public/` except `.gitkeep` (it's
`docker/Dockerfile`'s build output, copied in only for the production
image), and no test job builds `apps/web` first, so CI never has that file
and both new tests 404/500'd there. This was also the first test ever to
exercise the SPA-fallback wildcard route's `response.download()` call at
all — that line had no prior coverage either. Fixed: the test group's
`group.each.setup` now writes its own `200.html` fixture and removes it in
the returned teardown (the same setup/teardown-returns-cleanup pattern
already used by `debug.spec.ts`/`alexa_oauth.spec.ts`), so the test is
self-contained instead of depending on incidental local disk state.

**Port defaults (live-instance feedback, this PR)**: port 3000 collided
with another common self-hosted app already running on the user's Home
Assistant host, and with Ingress now the default way in, there's no
reason to force a host port at all. `ha-addon/everylist/config.yaml`'s
`ports: { 3000/tcp: }` is now `null` (an empty YAML value) — off by
default, per Home Assistant's add-on port schema, but still
user-toggleable from the add-on's Network settings for anyone who wants
direct/LAN access with no Home Assistant in the loop; `DOCS.md` suggests
**3333** as a non-colliding value if they turn it on. Also added
`panel_icon: mdi:format-list-checks` — purely cosmetic, giving EveryList a
real icon for the "Show in sidebar" toggle Home Assistant already offers
natively for any Ingress-enabled add-on (no separate config needed to
make that toggle appear, just to give it a good icon).

**Verification** (live instance, in addition to Phase 1's list): confirm
the add-on now opens through the existing reverse-proxy path with no
separate port; log in and exercise the golden path (create a list,
add/check items, realtime update) entirely inside the iframe; confirm the
documented refresh caveat behaves as described (lands outside the proxy,
not a crash, reopening recovers); confirm the plain-port `webui` link
still works unchanged.

## Fixing Ingress for real

The service worker fix above was verified, live, to not be enough on its
own — the iframe still rendered blank. This repo's PR #224 automated
review (Kilo Code Review) caught several more fundamental problems in the
same code, most of which are more directly responsible for the blank page
than the service worker ever was. Each was verified against actual source
before acting on it:

1. **`X-Frame-Options: DENY` blocked the iframe outright.**
   `apps/api/config/shield.ts` (`@adonisjs/shield`'s middleware, applied
   globally) set `action: 'DENY'` — blocking *any* framing, same-origin
   included. Ingress embeds this app in an iframe inside Home Assistant's
   own frontend page; `DENY` refuses that regardless of anything else
   being correct, before asset loading or the service worker even get a
   chance to matter. Almost certainly the actual primary cause. Fixed:
   `action: 'SAMEORIGIN'` — safe globally, not an ingress-only carve-out,
   since HA's frontend and this app's ingress-proxied content share the
   exact same origin. Still blocks the actual clickjacking threat
   `X-Frame-Options` exists for (a *different* site framing EveryList).

2. **`ingress_entry: /_ha-ingress-entry` was never a valid route, for two
   independent reasons.** It didn't correspond to any real SvelteKit
   route — `+layout.ts`'s `prerender = true` default makes every real
   page a static file `@adonisjs/static` serves before routing runs, so
   the entry had to be a made-up path to reach the rewrite route at all —
   but SvelteKit's client router matches the *current URL* against the
   real route table on hydration regardless of which HTML shell served
   it, rendering its own 404 for an unmatched URL even with the rewrite
   working perfectly. Separately, the leading underscore was itself a
   SvelteKit routing-exclusion convention collision (`_`-prefixed
   directories under `src/routes/` are excluded from routing entirely,
   for colocating non-route files) — so the path was never routable in
   the first place, independent of the prerendering problem. Fixed: a
   new, real, deliberately non-prerendered route,
   `apps/web/src/routes/ha-ingress-entry/` (no underscore) — `+page.ts`
   sets `export const prerender = false` (keeps it dependent on the
   200.html fallback, reaching the rewrite route) and its `load()`
   unconditionally `redirect(307, resolve('/'))`s, reusing `/`'s own
   existing "signed-in → `/lists`, else show the splash" logic
   (`apps/web/src/routes/+page.ts`) instead of duplicating it — resolved
   entirely client-side via SvelteKit's own router, no second HTTP
   request. `config.yaml`'s `ingress_entry` updated to match.

3. **Home Assistant's root-scoped service worker** — the original
   finding above, unchanged: still needed once #1 and #2 let the page
   actually render.

4. **`x-ingress-path` was interpolated into HTML/JS unescaped.**
   `ingress_service.ts` spliced the header value directly into
   attributes and a `<script>` body with no validation — attacker
   reachable (it's an HTTP header), even though normally
   Supervisor-generated. Fixed: `isValidIngressPath()` checks it against
   Supervisor's real format (`^/api/hassio_ingress/[a-f0-9]+$`, case
   insensitive) before rewriting anything; a non-match is treated exactly
   like no header at all (unmodified passthrough), not sanitized/escaped
   — and logged, since a present-but-rejected header would otherwise look
   identical to "not behind Ingress at all."

5. **`apiBaseUrl()` returning a relative path broke `realtime.ts`'s
   fallback.** `realtime.ts` did `apiBaseUrl() || window.location.origin`
   — always absolute before this phase (`''` or a full native server
   URL). Under ingress, `apiBaseUrl()` now returns a non-empty *relative*
   path, short-circuiting the `||` and handing Transmit an invalid
   `baseUrl`, breaking realtime sync specifically under ingress. Fixed:
   new `resolveRealtimeBaseUrl()` — empty resolves to
   `window.location.origin` (unchanged), an already-absolute native URL
   passes through unchanged (deliberately *not* routed through `new
   URL()`, which normalizes a bare origin by adding a trailing slash —
   `server-url.ts` stores it without one), and a root-relative ingress
   path resolves against `window.location.origin`.

6. **Option-supplied `APP_KEY` was never persisted.**
   `05-ha-options` set it as an env var but never wrote it to
   `/config/app_key` the way `20-app-key` does for a generated key —
   clearing the option later left `20-app-key` with neither an env var
   nor a persisted file, silently generating a *new* key and invalidating
   every existing session. Fixed: `05-ha-options` now also persists an
   option-supplied `APP_KEY` to `/config/app_key` (same file/permissions
   `20-app-key` itself uses), so clearing the option later still finds it
   via the existing fallback.

**Smaller fixes bundled in alongside these** (same files, low risk):
a `Vary: x-ingress-path` response header on the rewritten shell, since
it's genuinely conditional on that header; `DOCS.md`'s Options section
incorrectly implied automated backups live under Server settings — they
have their own page (already correctly
described in this same file's "Data & backups" section).

**Post-review fix (live-instance testing, this PR)**: one Kilo suggestion
that *was* initially applied turned out to be wrong in practice —
`app_url`'s schema type `str?` → `url?`, meant to get proper URL
validation in the HA options UI. `?` only makes the *key* optional, not
the value: HA's `url` type rejects an empty string as "not a valid URL",
but `""` is this option's actual, documented default (DOCS.md: "leave it
blank for a working zero-config install"). Broke a fresh install
immediately with "Invalid configuration - expected a URL." Reverted to
`str?`, with a comment on that line explaining why, so this doesn't
regress on a future "helpful" edit.

**Findings checked and correctly not acted on**: CI's `bump-addon-version`
job already explicitly checks out `ref: main` — not an "implicit target
branch." The `version:` "v" prefix and `image:` tag resolution were both
already empirically verified correct by the live install (the earlier
`0.0.0` → `v1.4.0` fix *was* that verification). The test fixture
teardown deleting `200.html` is intentional, matching this suite's
existing setup/teardown-returns-cleanup pattern.

**Tests**: unit tests for `isValidIngressPath` (valid format; each
injection-shaped rejection — attribute breakout, script-body breakout;
out-of-prefix/empty rejections) and for the new
`ha-ingress-entry/+page.ts` redirect (mirrors the existing test for `/`'s
own `load()` redirect). A `realtime.svelte.spec.ts` case for the
ingress-relative-path resolving to an absolute URL. A functional test for
the new `/_ha-ingress-shadow-sw.js` route. All pass at 100% coverage on
both apps alongside the rest of the suite (`registerIngressShadowServiceWorker`
needed two `/* v8 ignore */` markers — `window.location.reload` isn't
mockable in this project's real-Chromium browser tests, so its default
reload function is split into its own ignored block the same way
`realtime.ts`'s Transmit constructor already is; a defensive
`'serviceWorker' in navigator` check can't be forced false in that same
real-Chromium environment either, for the same reason `Reflect.deleteProperty`
can't remove a `Navigator.prototype` accessor).

**Verification** (live instance, supersedes the earlier verification
note): reinstall/refresh once more, open the Ingress panel, confirm it
actually renders (not blank) — possibly with one visible reload on the
first open this session (the shadow-worker race) — then the golden path
end to end inside the iframe, and that a second open in the same browser
session loads immediately with no reload and no 404s.

**Second Kilo review round (commit `01f0a54`)** — 7 more findings against
the code above, none CRITICAL:

- `ha-ingress-entry/+page.ts`'s `redirect(307, resolve('/'))` resolved
  against this app's build-time base, which has no idea about the
  random-per-install Ingress prefix baked in only at runtime — the
  redirect would have taken the user out of the Ingress iframe entirely,
  to the bare origin root, instead of `/lists` inside the proxy prefix.
  The most consequential finding of this round; likely would have
  reproduced as an apparent "blank/wrong page after the very first
  redirect" even with every earlier fix in place. Fixed: prefix the
  target with `ingressBase()` — `${ingressBase()}${resolve('/')}` — a
  no-op outside ingress since `ingressBase()` is `''` there.
- `ingress.ts`'s reload-once guard could loop forever if `sessionStorage`
  is unavailable or `setItem` throws (privacy mode, quota): the old code
  reloaded unconditionally on that catch, and a reload re-runs the same
  code from scratch with no memory of having already reloaded. Fixed:
  skip the reload entirely on that catch instead — losing the reload
  optimization for that one session beats an infinite reload loop.
- `waitForActivation` never resolved if the worker became `redundant`
  (install failed, or a newer registration superseded it) instead of
  reaching `activated` — an unresolved promise, silently doing nothing
  further. Fixed: also resolve on `redundant`.
- `isValidIngressPath`'s hex-charset assumption about Supervisor's real
  token format is unverified beyond what live testing has shown so far —
  a rejected header now logs a warning rather than silently falling back
  to the same shell a request with no Ingress header at all would get, so
  a format mismatch is diagnosable instead of looking identical to "not
  behind Ingress." (The warning's payload was revised in the next round
  below to stop including the header's raw value.)
- `05-ha-options`'s explicit `chown` of `/config/app_key` was redundant
  (and its comment backwards about why): this script runs *before*
  `10-remap-user`'s own `chown -R appuser:appuser /config`, which
  re-chowns the file moments later regardless — unlike `20-app-key`,
  which runs *after* `10-remap-user` and so genuinely needs its own
  chown. Removed the chown; kept the `chmod` (the recursive chown doesn't
  touch mode bits) and corrected the comment.
- A stale "Not exported" doc comment on `waitForActivation` (it is
  exported, for testability) — reworded.
- This doc's own quoted regex for `isValidIngressPath` omitted the `i`
  flag the implementation actually uses — added the case-insensitive
  note above.

**Third Kilo review round** — 3 more findings, none CRITICAL, against the
fixes above:

- **The `ha-ingress-entry` route still couldn't be reached under
  Ingress**, even after the previous round's redirect-target fix — the
  actually blocking bug, and arguably the most consequential finding
  across every round so far. Supervisor strips the
  `/api/hassio_ingress/<token>` prefix server-side before forwarding to
  this container, but the *browser* never learns that — the iframe's
  `src` is the full prefixed URL, so `window.location.pathname` (what
  SvelteKit's client router actually matches routes against) still
  carries the prefix. Nothing in this app's route table — including the
  new `/ha-ingress-entry` route itself — has any way to match a
  random-per-install token prefix, so the client router would render its
  own 404 before `load()` ever ran, on every single Ingress request, not
  just the entry point. A build-time `paths.base` can't hold a
  per-install random value, so the fix is SvelteKit's `reroute` hook
  (`apps/web/src/hooks.client.ts`, new file): it rewrites only what the
  router uses to *match* a route, stripping `ingressBase()` off the
  pathname first — the address bar and `window.location` are untouched,
  so the previous round's `ingressBase()`-prefixed redirect target is
  still exactly right. Applies to every Ingress navigation, not just the
  entry point, since `reroute` runs on every route change.
- `waitForActivation` still hung if the worker was *already* `redundant`
  at call time (the previous round's fix only handled reaching
  `redundant` later via `statechange`), and treating `redundant` as a
  reason to resolve at all meant `registerIngressShadowServiceWorker`
  reloaded the page even when the worker had failed to activate — a
  reload that can't fix a failed install. Fixed: check the already-`redundant`
  case up front (same as the already-`activated` one), resolve
  `true`/`false` instead of `void` so the caller can tell which happened,
  and skip the reload entirely when `false`.
- The `x-ingress-path` rejection log added last round echoed the header's
  raw value — itself the exact untrusted input that had just failed
  validation, on a public, unauthenticated, unthrottled route. Logging it
  verbatim let any client inject arbitrary bytes into the log stream or
  pad requests to flood it. Fixed: log only that a header was present and
  rejected, plus its length — enough to diagnose a real Supervisor format
  drift without echoing attacker-controlled content.

**Fourth Kilo review round** — 1 finding, against `hooks.client.ts`
above: `reroute` returned only the stripped pathname, dropping
`url.search`/`url.hash`. SvelteKit resolves whatever `reroute` returns
against the original URL, so a query string or hash on a prefixed
Ingress URL would have been silently lost from the URL used for
matching — concretely, `login`'s `?next=`, `signup`'s equivalent, and
`reset-password`'s `?token=` all read their query params off `page.url`,
which is built from that same resolved URL. Fixed: append `url.search +
url.hash` to the returned pathname, matching the pattern SvelteKit's own
`reroute` docs use for exactly this reason.

Live-instance verification is still the same open item above — none of
this round's fixes have been tested against a real build yet either.
`config.yaml`'s `image`/`version` still point at a pre-PR image tag, so
none of this PR's code changes reach a running container until a fresh
image is built (merge to `main` → `nightly` tag, or a version tag) and
the add-on is pointed at it.

## Live testing against a real build (post-merge)

PR #224 merged. `config.yaml`'s `version` is temporarily pinned to
`nightly` (docker-publish.yml's rolling tag, rebuilt on every push to
`main`) instead of a real `vX.Y.Z` release tag, specifically so live
Ingress testing runs against an image that actually contains this PR's
code — revert to a pinned release tag once Ingress is confirmed working.
Two more bugs turned up from that live testing, both fixed directly on
`main` (small, well-tested, high-confidence fixes - not worth a full PR
review cycle mid-investigation):

- **No `Cache-Control` on the SPA-fallback/Ingress route.** Live
  DevTools showed a request served `200 (from disk cache)` still
  carrying pre-fix, un-prefixed asset paths, even against the `nightly`
  build with every fix above already in the image. Without an explicit
  header, browsers apply *heuristic* freshness caching based on
  `200.html`'s on-disk mtime (fixed at image-build time) - long enough
  to replay a stale response indefinitely without ever revalidating, and
  heuristic caching doesn't consult `Vary` before deciding to skip the
  network entirely, so the existing `Vary: x-ingress-path` header didn't
  help. Fixed: `Cache-Control: no-store` on this route (both branches),
  so every request reaches the handler fresh.
- **`rewriteHtmlForIngress` never rewrote the actual bootstrap.** Once
  the cache issue above was fixed, the *same* un-prefixed
  `/_app/immutable/entry/start.js` request still failed. adapter-static's
  real bootstrap (confirmed against an actual `pnpm build` output,
  `build/200.html`) isn't a `<script type="module" src="...">` tag at
  all - it's a plain `<script>` whose *body* dynamically
  `import()`s the entry chunk by a root-absolute string literal:
  `Promise.all([import("/_app/immutable/entry/start.js"), import("/_app/.../app.js")])`.
  The rewrite only ever matched HTML `src=`/`href=` attributes, so this
  exact literal was never touched - the app could never load under
  Ingress at all, regardless of every other fix. (This was actually
  flagged by an early Kilo review round - "Rewrite only matches
  root-absolute `src=`/`href=` attributes ... SvelteKit's inline
  `import(\"/_app/...\")` bootstrap is missed" - but dropped out of later
  rounds' issue lists without ever having been fixed, and was missed in
  every "findings checked and addressed" pass until live testing
  surfaced the actual symptom.) Fixed: `rewriteHtmlForIngress` now also
  rewrites `import("/...")` call sites, not just HTML attributes.
  **Known still-open gap**: this covers the *initial* bootstrap only.
  Lazily-loaded route chunks (fetched after hydration, e.g. navigating
  to `/lists`) are baked into `start.js`/`app.js`'s own compiled module
  manifest as further root-absolute `import()` calls - inside separately
  served, unmodified static `.js` files this HTML rewrite can't reach.
  Whether that actually breaks in-app navigation under Ingress is
  unverified; worth checking live once the bootstrap itself is confirmed
  working, rather than speculatively fixing further before knowing if
  it's actually reachable in practice.
- **`isValidIngressPath`'s charset was a guess, and the guess was
  wrong.** Even with the bootstrap fix deployed, the container's own
  logs (`logger.warn` added earlier specifically to make this
  diagnosable) showed every real request's `x-ingress-path` header being
  rejected: `ingressPathLength: 63`. Supervisor's real token isn't
  hex - it's base64url (mixed-case letters, digits, `-`/`_`, no
  padding), confirmed by a real captured value
  (`QyD5J3f3eD4KkmgnytItUFej8hkIzAHqbCqbJcjnV-Y`, 43 characters,
  consistent with Python's `secrets.token_urlsafe(32)` -
  `20 + 43 = 63`, matching the logged length exactly). The original
  `[a-f0-9]+` pattern was never based on an observed value, only an
  assumption - meaning **every single Ingress request had been silently
  falling back to the unmodified, un-prefixed shell this entire time**,
  through every fix above; none of them ever actually had a chance to
  run against a real request. Fixed: `INGRESS_PATH_PATTERN` now accepts
  `[A-Za-z0-9_-]+`, based on this observed value rather than another
  guess.

## Removing the Ingress-scope-shadowing service worker

With the charset fix live, `isIngress()` finally started returning
`true` in a real browser for the first time — meaning
`registerIngressShadowServiceWorker()` (§"Ingress support" above,
originally added to stop Home Assistant's own root-scoped service
worker from intercepting this app's fetches) executed for the very
first time too, since it's gated behind that exact check. In the same
session, live testing hit a page that 404'd on refresh (the already-known,
documented deep-link limitation) and then **stayed broken even across a
full container restart** - which a purely server-side problem can't
explain, since nothing about a container restart touches a browser's own
service worker registrations or caches.

That timing is too close to ignore: a brand-new service worker
registration, executing for the first time ever, landing at the exact
moment a session became unrecoverable without manually clearing browser
state (DevTools → Application → Service Workers/Cache Storage). It was
never proven necessary in the first place - it was a hypothesis from
before the real, evidence-backed causes (`X-Frame-Options`, the charset
bug) were found, and every earlier "confirmed working" claim about it
was actually just careful reasoning about code that had never once run.

Given this add-on is a narrow, single-purpose hosting integration and
the instruction to keep its footprint on the actual app as small as
possible, the shadow worker was removed outright rather than debugged
further: `registerIngressShadowServiceWorker`, `waitForActivation`, and
the `RELOAD_ONCE_KEY` reload-once logic are gone from
`apps/web/src/lib/api/ingress.ts` (which now only keeps `ingressBase()`/
`isIngress()`); the `/_ha-ingress-shadow-sw.js` route is gone from
`apps/api/start/routes.ts`; `+layout.svelte`'s ingress branch now simply
skips the PWA install prompt/real Service Worker under ingress, with no
replacement action. If Home Assistant's own service worker turns out to
still intercept this app's fetches now that the actual blocking bugs are
fixed, that will show up as a specific, reproducible symptom to
diagnose with real evidence - not a hypothesis to carry pre-emptively.

**Tests updated accordingly**: `ingress.svelte.spec.ts` now only covers
`ingressBase()`/`isIngress()`; the "Ingress scope-shadowing service
worker route" functional test group is removed from
`spa_fallback.spec.ts`; the "Tests" note above (referencing the
shadow-SW route) and the Verification note's "shadow-worker race" caveat
are superseded by this section.

## The root redirect had the same missing-prefix bug as ha-ingress-entry

Diagnosed from a live report, not a guess this time: the user noticed
the *first* real load after initial setup kept breaking, while the setup
wizard itself (shown directly at `/`, no further redirect - no user
exists yet) had worked fine. `apps/web/src/routes/+page.ts` redirects a
signed-in visitor from `/` to `/lists` via a bare
`redirect(307, resolve('/lists'))` - the exact same missing-`ingressBase()`
pattern already found and fixed in `ha-ingress-entry/+page.ts`'s own
redirect, just never applied here. Once any user account exists (i.e.
on every session after the one-time setup pass), this redirect fires
immediately after `ha-ingress-entry`'s own (now-correctly-prefixed)
redirect - dropping the Ingress prefix from the address bar right at the
start of every single session, not only on manual in-app navigation.
Fixed the same way: `redirect(307, \`${ingressBase()}${resolve('/lists')}\`)`.

**This fixes "fresh loads are broken," not "in-app navigation preserves
the prefix" in general** - that's a different, broader problem (any
plain `<a href="/...">` link click also drops the prefix on click, not
just this one redirect) and remains the same already-documented,
accepted limitation from `DOCS.md` (`refresh mid-session lands outside
the proxy, reopening from Home Assistant recovers`). Fixing that
generally would mean either patching every internal link/`goto()` call
individually, or a systemic mechanism (e.g. correcting the address bar
after every navigation) - deliberately not attempted here, given the
priority on keeping this integration's footprint on the real app as
small as possible and fixing only what's concretely broken and
confirmed, rather than speculatively solving the broader case.

## Re-adding a service worker - this time to fix requests, not just claim scope

Live testing (fresh browser, fully uninstalled/reinstalled, incognito -
ruling out any leftover cached/registered state from before) still 404'd
on the very first real page render: `nodes/0.js` (SvelteKit's *root
layout* - needed to render literally any page, not a deep-link edge
case) requested at the bare origin, unprefixed. Confirmed directly
against the real build output (`build/_app/immutable/entry/app.*.js`):
SvelteKit's compiled client runtime looks up lazily-loaded route chunks
through Vite's own `__vite__mapDeps` helper, a root-absolute path array
(`m.f = ["/_app/immutable/nodes/0.hash.js", ...]`) baked directly into
that file at build time - not HTML text, so neither of
`rewriteHtmlForIngress`'s rewrites (attributes, the inline bootstrap's
`import()` calls) can reach it. This is a structurally different problem
from everything fixed so far: previously everything reachable lived in
one dynamic HTML response; this lives inside a static, compiled,
minified `.js` file, in an internal Vite bundler implementation detail
with no public-API stability guarantee.

Two ways to actually fix it were on the table: rewriting the static
`.js` chunks themselves (broader server footprint, brittle - coupled to
Vite internals that could change on any future upgrade), or a service
worker that rewrites the *outgoing request* rather than any file's
content. The user independently researched the same conclusion
(`/_ha-ingress-sw.js` below matches that research: relative/scope-aware
registration, root-absolute paths break under a prefix, a
`Service-Worker-Allowed` header only needed if the worker script isn't
served from what is effectively its own scope's root - it is here, so
skipped).

This is **not the same shadow worker removed** a short time before -
different job, different registration point, addressing the specific,
confirmed reason it was suspected of causing that stuck session:

- **Different job**: the removed worker was a pure passthrough that did
  nothing but claim scope (a hypothesis about SW *control*, never
  actually proven). This one actively rewrites requests: for a
  same-origin request under `/_app/` that lands outside its own
  Ingress-prefixed scope, it refetches with the scope prepended instead
  - directly fixing the confirmed `__vite__mapDeps` gap, not a guess
  about what might help.
- **Different registration point, fixing a real chicken-and-egg bug in
  the removed version**: the old one registered from `+layout.svelte`'s
  `onMount` - but `+layout.svelte` *is* `nodes/0.js`, the exact chunk
  that fails to load. It could never register in time to fix its own
  load failure; that call site was structurally incapable of working on
  a first load, regardless of what the worker itself did. This one
  registers from the bootstrap HTML itself (`rewriteHtmlForIngress`,
  injected as part of the same `<script>` as the base-URL global),
  running before any chunk loading starts at all.

Kept deliberately narrow given the size of the risk being reintroduced:
`skipWaiting`/`clients.claim()` for the same reload-once-per-session
handoff as before (still needed - the very first load's synchronous
bootstrap fetches race ahead of registration regardless of how early it
starts, so one self-healing reload is expected on the first Ingress open
each session), and a `fetch` handler that only ever acts on `/_app/`
requests outside its own scope - everything else falls through
untouched, `event.respondWith` never called.

**Tests**: `ingress_service.spec.ts` asserts the registration call
appears with the correct prefixed URL/scope; `spa_fallback.spec.ts`
asserts the same in the full rewritten response, and a new test group
covers `/_ha-ingress-sw.js`'s content (the `/_app/` scope check, the
rewritten-request refetch). No web-side (`apps/web`) changes at all this
time - the entire mechanism is a server-generated string in
`ingress_service.ts`, which was already 100% Ingress-specific code; this
is a smaller footprint on the real app than the removed version, not a
larger one, despite doing more.

## The reroute hook was in the wrong file the entire time

Live testing after the fixup service worker shipped showed real
progress - the bootstrap loaded, the service worker successfully rescued
an out-of-scope `/_app/` chunk request live (`200 (from service
worker)`, directly observed, not inferred) - but the app still rendered
SvelteKit's own "404 Not Found" page on every load, never the real UI.
Since the JS demonstrably ran successfully by that point, the remaining
candidate was narrow: the `reroute` hook (`apps/web/src/hooks.client.ts`)
not actually taking effect.

Checked against SvelteKit's own source rather than guessed
(`@sveltejs/kit/src/core/sync/write_client_manifest.js`): the client
manifest wires up `reroute` **only from the universal hooks file**
(`src/hooks.ts`) - `hooks.client.ts` supplies `handleError`/`init` only.
A `reroute` export from `hooks.client.ts` is silently never called at
all. This app's `reroute` had been sitting in exactly that wrong,
inert location since it was first added - meaning **the reroute fix
this whole investigation depended on for every route to match under
Ingress had never once actually run**, on any commit, on any test. Its
own unit tests still passed throughout, because they call the exported
`reroute` function directly - proving the function's *logic* was
correct, but never that SvelteKit's client router would ever actually
invoke it.

Fixed by moving the file: `apps/web/src/hooks.client.ts` →
`apps/web/src/hooks.ts` (same `reroute` implementation, unchanged), and
its test alongside it (`hooks.client.svelte.spec.ts` →
`hooks.svelte.spec.ts`). Being a *universal* hook file, `hooks.ts` also
loads during the build's prerender crawl (Node, no `window`) - safe,
since `ingressBase()` already guards on `hasWindow()` and returns `''`
there, making `reroute()` a no-op exactly like it is for every
non-Ingress deployment.

**The lesson generalized**: for this specific class of bug (a hook or
callback that a framework is supposed to invoke, but doesn't), a unit
test that calls the export directly proves the function's own logic
works, but proves nothing about whether the framework actually wires it
up - that requires either an integration test that exercises the real
framework machinery, or checking the framework's own source for exactly
how/where it resolves that hook, the way this was ultimately confirmed.
Worth keeping in mind for any other SvelteKit hook this add-on's Ingress
support relies on going forward.

## Supervisor's own Ingress panel produces a doubled slash

Live testing straight after the `hooks.ts` fix shipped a real,
different console error - `Not found: /api/hassio_ingress/<token>//ha-ingress-entry`,
a double slash right before `ha-ingress-entry`. This is evidence the
previous fix is genuinely wired up now, not a sign it was wrong: the
error is SvelteKit's client router reporting a match failure *after*
`reroute()` ran (if `reroute` still weren't wired up, the router would
instead fail to match the full, un-stripped, still-prefixed URL - a
different failure shape entirely).

The double slash itself comes from Supervisor's own Ingress panel, not
this app - it constructs the iframe's `src` by concatenating a
trailing-slash base with `ingress_entry`'s own leading slash. `reroute()`
stripped the base correctly but left the embedded `//` in the remainder,
which matches no real route (none start with a doubled slash). Fixed:
`.replace(/^\/+/, '/')` on the stripped remainder, collapsing any
leading run of slashes to one - defensive against the specific artifact
observed without needing to control or understand why Supervisor
produces it.

Same live trace showed the app's background data sync (folders/lists)
firing regardless of the routing error and getting `401 Unauthorized` -
expected pre-login behavior (no token yet), not a new bug; revisit only
if it persists after this fix once past the routing issue.

## Ingress: the full blocker chain, for posterity

Getting Ingress from "blank page" to actually rendering took far more
rounds than expected, each hiding the next behind it - fixing one
blocker just exposed the next layer, since nothing downstream of a
given bug had ever actually run yet. Recorded here in the order they
were found/fixed, as a single reference instead of needing to read the
full blow-by-blow above:

1. **`X-Frame-Options: DENY`** blocked the Ingress iframe outright,
   regardless of anything else being correct. Fixed: `SAMEORIGIN`
   (`apps/api/config/shield.ts`). See "Fixing Ingress for real" §1.
2. **`ingress_entry: /_ha-ingress-entry` was never a routable path** -
   not prerendered but also not a real SvelteKit route, and its leading
   underscore collided with SvelteKit's own routing-exclusion
   convention. Fixed: a real, non-prerendered
   `apps/web/src/routes/ha-ingress-entry/` route. See "Fixing Ingress
   for real" §2.
3. **`x-ingress-path` was interpolated into HTML/JS unescaped** -
   attacker-reachable input spliced directly into an HTML attribute and
   a `<script>` body. Fixed: `isValidIngressPath()` validates the format
   before any rewriting happens. See "Fixing Ingress for real" §4.
4. **`realtime.ts` assumed `apiBaseUrl()` was always absolute** - broke
   under Ingress, where it's a relative path. Fixed: resolve against
   `window.location.origin`. See "Fixing Ingress for real" §5.
5. **Option-supplied `APP_KEY` was never persisted** - clearing the
   option later would silently rotate the key. Fixed:
   `05-ha-options` also persists it to `/config/app_key`. See "Fixing
   Ingress for real" §6.
6. **`app_url: url?` broke every fresh install** - HA's `url` schema
   type rejects `""`, but blank is this option's real, documented
   default. Fixed: reverted to `str?`. See "Post-review fix
   (live-instance testing, this PR)".
7. **`Cache-Control` was never set on the SPA-fallback/Ingress route** -
   a browser's heuristic freshness caching (based on `200.html`'s
   on-disk mtime) could replay a stale, pre-fix response indefinitely
   without ever reaching the server again. Fixed: `no-store`. See "Live
   testing against a real build (post-merge)".
8. **`rewriteHtmlForIngress` only rewrote HTML attributes** - missed
   adapter-static's actual bootstrap, a plain `<script>` whose body
   dynamically `import()`s the entry chunk by a root-absolute string
   literal. The app could never load under Ingress at all until this
   was found by inspecting the real build output directly. See "Live
   testing against a real build (post-merge)".
9. **`isValidIngressPath`'s charset was a guess, and the guess was
   wrong** - assumed hex, but Supervisor's real token is base64url.
   Every single Ingress request had been silently falling back to the
   unmodified shell through every fix up to this point; none of them
   had ever actually run against a real request. Confirmed via the
   container's own logs. See "Fix isValidIngressPath's token charset:
   base64url, not hex" section above.
10. **A shadow service worker (v1) that did nothing but claim scope** -
    a hypothesis from before any of the above were found, never proven
    necessary, executing for the first time the moment charset fix
    landed - coinciding with a session becoming unrecoverable even
    across a container restart. Removed outright rather than debugged
    further. See "Removing the Ingress-scope-shadowing service worker".
11. **Root's own sign-in redirect had the same missing-prefix bug as
    `ha-ingress-entry`'s** - `/` → `/lists` with no `ingressBase()`
    prefix, firing on every session past the one-time setup pass (which
    is why setup worked but nothing since). See "The root redirect had
    the same missing-prefix bug as ha-ingress-entry".
12. **Lazily-loaded route chunks (`nodes/0.js` - the root layout,
    needed for any page) are baked into compiled `app.js` as further
    root-absolute paths (Vite's `__vite__mapDeps`)** - not HTML text, so
    no text rewrite could reach them; this blocked the very first real
    page render, not just deep links. Fixed with a second, different
    service worker (v2) that actively rewrites out-of-scope `/_app/`
    requests, registered from the bootstrap HTML itself rather than
    `+layout.svelte` (which *is* `nodes/0.js` - it could never register
    in time to fix its own load failure). See "Re-adding a service
    worker - this time to fix requests, not just claim scope".
13. **The `reroute` hook lived in `hooks.client.ts`, which SvelteKit
    never reads for that hook** - confirmed against SvelteKit's own
    source; only `hooks.ts` (universal) is wired up for `reroute`. Every
    earlier routing fix had depended on a hook that had never once
    actually executed. Fixed by moving the file, same logic. See "The
    reroute hook was in the wrong file the entire time".
14. **Supervisor's own Ingress panel constructs a doubled slash** in the
    iframe URL (`<token>//ha-ingress-entry`) - not this app's doing, but
    `reroute()` needed to normalize it defensively. See "Supervisor's
    own Ingress panel produces a doubled slash".
15. **`page.url.pathname` always reflects the real, prefixed browser
    URL - `reroute()` never changes what app code sees there.** Once the
    app finally rendered, the bottom nav bar was invisible on first
    load, appearing only after navigating into a list and back.
    Confirmed against SvelteKit's own client runtime: `reroute()` only
    changes what the *router* uses to match a route; `page.url` is
    explicitly set from the original, un-rerouted URL. `+layout.svelte`'s
    `showNav` and `BottomNav.svelte`'s active-tab/scroll-remember logic
    all compared `page.url.pathname` directly against unprefixed paths
    (`/lists`, `/settings`) - which never matched while the address bar
    still carried the Ingress prefix. It "recovered" after visiting a
    list and back only because a plain in-app link click drops the
    prefix from the address bar as an unrelated side effect (the
    already-documented, still-open limitation - see "The root redirect
    had the same missing-prefix bug as ha-ingress-entry"). Fixed with a
    shared `stripIngressPrefix()` helper (`$lib/api/ingress.ts` - the
    same normalization `reroute()` itself uses, refactored into one
    place) and updated the three call sites that compared
    `page.url.pathname` directly. See "`page.url` never reflects
    `reroute()`'s output" below.

After #15, the app renders and the golden path is reachable, with the
bottom nav correctly visible from the very first load. Confirmed live by
the user (2026-09-11).

## `page.url` never reflects `reroute()`'s output

Blocker #15 above generalizes beyond the one component it was first
noticed in: **any** app code comparing `page.url.pathname` directly
against an unprefixed path silently breaks on the first Ingress load,
not just `BottomNav`. Three call sites needed it at the time this was
found - `+layout.svelte`'s first-run/setup redirect guard, its `showNav`
derivation, and `BottomNav.svelte`'s active-tab check and
scroll-remember regex - all now go through
`stripIngressPrefix(page.url.pathname)` instead of the raw value.
`stripIngressPrefix` and `hooks.ts`'s `reroute()` now share the exact
same stripping/normalization logic (including the doubled-slash
collapse from blocker #14), rather than keeping two copies of it in
sync by hand.

**If a future change adds new code that branches on the current route**
(another exact-path check, another regex against `page.url.pathname`,
anything comparing against `/lists`, `/settings`, `/setup`, etc.) - it
needs `stripIngressPrefix()` too, or it will silently misbehave on the
very first load under Ingress, the same way `BottomNav` did. There's no
lint rule or type-level guard against this - `page.url.pathname` is a
completely valid, correctly-typed value to read, it's just the wrong
one for anything that needs to know "which page are we logically on."

## Post-live-testing follow-ups (full app walkthrough)

A full click-through of the app under a working Ingress session (once it
finally rendered) surfaced four more findings, on top of the blocker chain
above:

1. **PWA debug section's Update/Reset controls under Ingress.** Settings →
   Troubleshooting's "check for update" always returns `'unavailable'`
   under Ingress (`checkForUpdate()` requires a real Workbox SW
   registration, which is deliberately skipped under Ingress — see the
   blocker chain above), and "reset app" is actively dangerous there:
   `resetApp()` → `clearAppCaches()` calls
   `navigator.serviceWorker.getRegistrations()` and unregisters *every* SW
   for the origin, including the essential `_ha-ingress-sw.js` fixup
   worker — pressing it would silently reintroduce the blank-page bug.
   Fixed: `apps/web/src/routes/settings/+page.svelte` now shows a plain
   explanatory note under Ingress instead of the update/reset controls
   ("Home Assistant manages updates for this add-on...").
2. **Sync page's "Refresh now" button under Ingress.** `refreshApp()` is
   `window.location.reload()`, which under Ingress reloads the iframe
   from its original (frozen) `src`, not the current in-app page — this
   is what produced the 404-and-stuck-browser report during testing.
   Fixed (disable-only, not a real fix — see point 3): the button is
   `disabled` under `isIngress()` with an explanatory `title`, rather
   than shipping a "press this button to break your browser" trap.
3. **Confirmed as an inherent Ingress/iframe limitation, not a bug:** a
   full-page refresh at any in-app route always bounces back to the
   iframe's original entry URL, because the iframe's `src` never changes
   during client-side navigation — there's no URL for the browser to
   refresh *back to*. Home Assistant's own AdGuard Home add-on
   (`hassio-addons/addon-adguard-home`) exhibits the identical behavior.
   Not planned to be fixed; users who need reliable deep-link refresh are
   better served by the add-on's direct port (or a reverse proxy) instead
   of Ingress.
4. **Auth is not tied to Home Assistant's own login/users.** Investigated
   two angles:
   - Home Assistant's own developer docs
     (developers.home-assistant.io) state that Ingress-embedded add-ons
     are *expected* not to require their own separate login — the user is
     already authenticated by Supervisor before the iframe is ever
     loaded, so re-prompting for credentials is considered an anti-pattern,
     not a compliance requirement to add auth.
   - Separately, Home Assistant does offer an explicit opt-in mechanism
     for add-ons that still want to gate their own login form against HA
     accounts: `auth_api: true` in `config.yaml` enables a Supervisor
     `/auth` endpoint that validates a submitted username/password (or
     Basic Auth) against Home Assistant's real user accounts. This is
     what `addon-adguard-home`'s `config.yaml` actually sets — it isn't
     an automatic bypass, it's a credential-validation API an add-on's
     *own* login form can call instead of maintaining a fully separate
     user database. Adopting it here would mean adding a new login flow
     that offers "sign in with your Home Assistant account" as an
     option alongside the existing token-based login — a real feature,
     not a small fix, so it's left for a future phase rather than bundled
     into this Ingress-stabilization pass.

## Out of scope (future)

Submitting to the official Home Assistant Community Add-ons repository (a
much higher bar — code review, its own contribution guidelines — not
needed for self-hosting via a personal add-on repository).

Validating login against Home Assistant's own user accounts via the
Supervisor `auth_api` endpoint (see point 4 above) — a genuine new login
flow, scoped as a future enhancement rather than part of Ingress
stabilization.
