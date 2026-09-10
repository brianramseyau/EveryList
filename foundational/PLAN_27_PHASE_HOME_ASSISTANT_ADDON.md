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

Live-instance verification is still the same open item above — none of
this round's fixes have been tested against a real build yet either.
`config.yaml`'s `image`/`version` still point at a pre-PR image tag, so
none of this PR's code changes reach a running container until a fresh
image is built (merge to `main` → `nightly` tag, or a version tag) and
the add-on is pointed at it.

## Out of scope (future)

Submitting to the official Home Assistant Community Add-ons repository (a
much higher bar — code review, its own contribution guidelines — not
needed for self-hosting via a personal add-on repository).
