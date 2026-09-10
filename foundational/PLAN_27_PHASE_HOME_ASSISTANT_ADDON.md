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

Deliberately deferred out of v1:
- **Ingress** (embedding the UI in the HA sidebar via Supervisor's reverse
  proxy) — the SvelteKit SPA's asset paths, cookies, and CORS/`APP_URL`
  handling haven't been verified against ingress's path-prefix proxying.
  v1 ships a plain port mapping + `webui` link, same UX as the Unraid
  template today.
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

## Out of scope (future)

Ingress support; submitting to the official Home Assistant Community
Add-ons repository (a much higher bar — code review, its own contribution
guidelines — not needed for self-hosting via a personal add-on repository).
