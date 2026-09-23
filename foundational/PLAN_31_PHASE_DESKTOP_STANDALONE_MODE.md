# Phase 31 — Desktop App: Standalone (embedded server) mode

## Context

The Electron desktop app (`apps/desktop`, Phase 22) is currently a thin client only: it serves the
static `apps/web/build` bundle from a fixed loopback HTTP server and talks to a separately-deployed
EveryList server (typically Docker) over the network, exactly like the iOS/Android apps. This was a
deliberate, documented decision — `PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md`'s "Locked decisions":
*"Client only. The desktop app never runs AdonisJS, never opens a database, never runs
migrations."* Made specifically to avoid the native-module packaging problems (`better-sqlite3`
trapped in `app.asar`, per-OS/arch ABI rebuilds) that a sibling Electron project hit — see PLAN_22's
"Prior art" table.

The ask this phase addresses: someone who wants to try EveryList, or run it permanently on a single
machine, without standing up Docker or any server at all. The goal is a **Standalone mode** — the
desktop app optionally embeds the exact same AdonisJS API + SQLite database it already ships in
Docker, running entirely on-device, loopback-only, single user. This is additive: the existing
"connect to my own server" thin-client mode from Phase 22 is unchanged and remains fully supported
side by side.

Decisions locked in for this phase:

- **Loopback only** — no LAN exposure option. Matches the existing security posture (Electron
  already binds `127.0.0.1` only).
- **One-time choice at first launch** — a user picks Standalone or Remote-server on first run;
  switching later is unsupported in this pass (manual reinstall / config edit only), matching the
  existing precedent that changing the loopback port already resets local state.
- **Full feature, mainline** — not a stripped-down experiment; ships with proper CI/release-matrix
  support across macOS/Windows/Linux, same as the rest of the desktop app.

## Architecture

Standalone mode reuses the **Docker topology** (one process serves API + static frontend on one
origin) rather than the existing desktop topology (static-only server + cross-origin fetch to a
remote server). This is the key simplification: same-origin means **no CORS handling needed at
all** for this mode, and no `serverUrl` needs to be stored client-side.

```
Remote mode (existing, Phase 22, unchanged):
  Electron main -> static-server.cjs (127.0.0.1:41783) -> serves apps/web/build
  Renderer fetches cross-origin -> user's own server (Docker, wherever)

Standalone mode (new):
  Electron main -> spawns embedded apps/api build as a child process
                   (127.0.0.1:<new fixed port>, serves API *and* apps/web/build, same as Docker)
  Renderer loads that origin directly -- same-origin fetch, identical to PWA/Docker
```

Use a **new, distinct fixed port** for standalone mode (do not reuse `41783`) — e.g. `41790` in
`apps/desktop/lib/config.cjs` alongside the existing `DEFAULT_PORT`. Keeping the two modes on
different origins means the existing remote-mode users' token/cache/port logic is untouched, and a
user who (manually, unsupported) tries both modes on one machine doesn't have them collide on
localStorage/IndexedDB keyed by origin.

## First-run flow

1. On first launch, if no mode has been chosen yet (no marker in `app.getPath('userData')`), the
   app boots exactly as it does today: `static-server.cjs` on `41783`, loading the normal SPA.
2. Add a new desktop-only first-run screen in `apps/web` (gated on `isDesktop()` from
   `apps/web/src/lib/platform/desktop.ts`, same pattern used elsewhere) presenting two choices:
   **"Connect to my own server"** (existing flow — routes into `/server-setup` unchanged) and
   **"Use EveryList on this device only"** (new).
3. Picking standalone calls a new IPC bridge method exposed via `apps/desktop/preload.cjs` (e.g.
   `window.everylistDesktop.enableStandalone()`). The main process then:
   - Writes a mode marker to `userData` (e.g. `mode.json: { mode: "standalone" }`).
   - Boots the embedded server (see below), waits for its health check.
   - Navigates the existing `BrowserWindow` to the embedded server's origin
     (`mainWindow.loadURL('http://127.0.0.1:<port>/')`) — a full origin swap, which is fine since
     nothing of value exists yet on the old origin at this point in first-run.
4. Since standalone hides logout entirely (see "Single-user simplifications" below) and there's no
   one else who'll ever see a login screen on this machine, don't show the setup wizard's
   name/email/password form to the user at all. Instead, the moment the embedded server's health
   check passes, the Electron main process itself calls the existing setup endpoint
   (`setup_controller.ts`'s `POST` handler — same one the `/setup` wizard form calls) once, with a
   generated placeholder identity (e.g. a fixed local email, a random password never surfaced
   anywhere), obtains the resulting session token, and hands it to the renderer before navigating
   there — so the user lands directly in their lists with zero forms. **No backend changes are
   needed for this** — only the caller changes, from a human filling in `/setup` to Electron calling
   the same endpoint programmatically. (A "what's your name?" prompt could still be offered inside
   the app later, e.g. from Settings, if personalizing the owner's display name matters — optional,
   not required for first run.)
5. On every subsequent launch, the main process reads the mode marker: standalone → skip
   `static-server.cjs` entirely, boot the embedded server, wait for health, `loadURL` directly.
   Remote → behave exactly as today.

## Embedded server lifecycle (new: `apps/desktop/lib/embedded-server.cjs`)

Spawns the built `apps/api` server as a **separate child process** (not in-process in Electron's
main) — isolates crashes from the GUI process and lets the existing `bin/server.js` entrypoint run
basically unmodified. Boot sequence mirrors what `docker/root/etc/cont-init.d/` already does for
Docker, just re-implemented as JS in the main process instead of shell/s6:

1. **Data directory**: `app.getPath('userData')/server/` holds `everylist.sqlite3`, `app_key`,
   `config.yaml`, backups — directly analogous to Docker's `/config` volume.
2. **App key**: generate once and persist to `<data dir>/app_key` if absent (mirrors
   `docker/root/etc/cont-init.d/20-app-key`).
3. **Migrations**: run once per boot before starting the listener (mirrors `.../30-migrate`) —
   spawn the built `ace.js migration:run --force` (or equivalent) against the data-dir SQLite file.
4. **Start server**: spawn `build/bin/server.js` with env pinned for a single-user local instance:
   `HOST=127.0.0.1`, `PORT=<standalone port>`, `NODE_ENV=production`,
   `DATABASE_FILENAME=<data dir>/everylist.sqlite3`, `APP_KEY=<from step 2>`,
   `APP_URL=http://127.0.0.1:<port>`, `SESSION_DRIVER=cookie`, `LIMITER_STORE=database`, and
   **`PUBLIC_SIGNUP_ENABLED=false`** (standalone is single-user by design — only the instance owner
   created at first run should ever exist).
5. **Health check**: poll `GET /api/v1/meta` (the same endpoint Docker's `HEALTHCHECK` already
   uses) with a short retry/timeout before calling `loadURL`, so the window never lands on a
   connection-refused error during the brief startup window.
6. **Crash handling**: if the child exits unexpectedly, surface `dialog.showErrorBox` with the
   child's captured stderr/log path (same "never silently sit with no window" principle already in
   `main.cjs`'s top-level `boot().catch(...)`), rather than leaving the window on a dead origin.
7. **Shutdown**: on `before-quit`, send the child SIGTERM, wait briefly, SIGKILL as a fallback —
   graceful shutdown isn't strictly required for SQLite/WAL durability but avoids leaving a stray
   process if the child hangs.
8. **Single instance**: already covered by the existing `app.requestSingleInstanceLock()` in
   `main.cjs` — a second launch focuses the existing window rather than spawning a second server
   against the same DB file.

## Packaging: the native-module problem PLAN_22 avoided

This is the real net-new engineering cost, and the reason PLAN_22 stayed client-only. Plan to solve
it the same way the Docker build already does, since that pipeline has already solved "produce a
production `apps/api` with a working `better-sqlite3`":

1. **New build step**, e.g. `apps/desktop/scripts/copy-api-server.mjs` (sibling of the existing
   `copy-renderer.mjs`): runs `pnpm --filter @everylist/api build`, then produces a
   self-contained production dependency set for it (reuse the same approach as
   `docker/Dockerfile`'s `prod-deps` stage — a `pnpm deploy`-style prune, not a hand-rolled copy),
   and stages the result under `apps/desktop/server/`.
2. **`better-sqlite3` ABI**: Electron's Node ABI differs from system Node's, so the prebuilt
   binary that a normal `pnpm install` fetches won't load inside Electron. Add `better-sqlite3` (or
   rely on it being pulled in transitively) such that `electron-builder`'s native-rebuild step
   (`npmRebuild`, on by default) rebuilds it against Electron's ABI per platform — this only works
   correctly when built *on* each target OS/arch, which the existing `native-build.yml` CI matrix
   (`macos-latest`/`windows-latest`/`ubuntu-latest`) already provides for exactly this reason.
3. **`asarUnpack`**: add `asarUnpack: ["server/**/*.node"]` (and the rest of `server/**` if
   AdonisJS's dynamic `import()`-based module resolution can't run from inside an asar — verify
   during implementation; if so, unpack `server/**` wholesale) to `apps/desktop/package.json`'s
   `build` config — this is the exact fix the reference project needed
   (`asarUnpack: ["**/*.node"]`, commit `1f7a6df` per PLAN_22's own prior-art table).
4. **Bundle size**: expect a real size increase (AdonisJS + its production deps, roughly what the
   Docker image's app layer weighs) on top of today's static-only desktop build. Not a blocker, but
   worth calling out in release notes.
5. **CI**: `native-build.yml` needs the API build step added before each OS's `electron-builder`
   packaging job, and `ELECTRON_SKIP_BINARY_DOWNLOAD=1` guidance for unrelated jobs stays as-is
   (unaffected).

## Single-user simplifications

Standalone mode has exactly one user (the instance owner created at first run) and no network
reachability from any other device (loopback only) — several pieces of existing UI assume
multi-user/networked usage and stop making sense here:

- **Logout** — re-authenticating requires the same password on the same machine, so it's pure
  friction with no benefit. Hide the "Log out" action in standalone mode. (The login *screen*
  itself stays as dead code that's simply unreached — no backend changes needed for this one.)
- **List sharing / invite-by-link / member management UI** — meaningless with a single user and no
  reachable network. Hide it in standalone mode.
- **Personal Access Tokens (Alexa / Home Assistant / widget integrations)** — all of these require
  another device or service to reach the API over the network, which loopback-only standalone
  mode never allows. Hide the "Access Tokens" settings section in standalone mode.
- **"Change server" / server-setup re-entry** — already inherently inapplicable, since there's no
  `serverUrl` in standalone mode; make sure Settings doesn't surface it.

**Mechanism**: add an `isStandalone()` helper next to the existing `isDesktop()` /
`isRemoteClient()` in `apps/web/src/lib/platform/desktop.ts`, backed by a value the preload bridge
exposes (e.g. `window.everylistDesktop.mode` — `'standalone' | 'remote' | null`, `null` for
non-desktop clients). Gate each of the UI pieces above behind it, the same way existing
desktop-only/mobile-only sections are already gated in `apps/web/src/routes/settings/+page.svelte`.

## Settings / UX additions

- Settings → About (or a new section) should show which mode is active: "Standalone — data stored
  on this device" vs "Connected to `<server url>`".
- For standalone mode, add a "Reveal data folder" action (open `userData/server/` in
  Finder/Explorer/file manager) — standalone users have no Docker volume to inspect, so this is
  their equivalent of "where's my data" and matters for manual backup/uninstall clarity.
- Existing automated backups (`app/services/backup_service.ts`, `Settings → Backups`) work
  unmodified once the embedded server is running — no new backend code needed there either.
- Document (README/desktop docs) that the same SQLite file format is used as Docker, so a user who
  outgrows standalone mode can copy `everylist.sqlite3` into a real Docker `/config` volume as a
  manual migration path — no export/import feature needs to be built for this pass.

## Files most affected

- `apps/desktop/main.cjs` — mode marker read, branch between `static-server.cjs` boot (remote) and
  `embedded-server.cjs` boot (standalone).
- `apps/desktop/lib/embedded-server.cjs` — new; child-process spawn/health-check/shutdown logic
  described above.
- `apps/desktop/lib/config.cjs` — add the new standalone port constant alongside `DEFAULT_PORT`.
- `apps/desktop/preload.cjs` — new IPC surface for `enableStandalone()` and mode/status queries.
- `apps/desktop/scripts/copy-api-server.mjs` — new; production `apps/api` build + prune, staged
  into `apps/desktop/server/`.
- `apps/desktop/package.json` — `better-sqlite3`-related dependency/rebuild wiring, `asarUnpack`.
- `apps/web/src/lib/platform/desktop.ts` — new `isStandalone()` helper; a new first-run route
  (mirrors `/server-setup`'s existing pattern) — the mode-choice screen.
- `apps/web/src/routes/settings/+page.svelte` — gate logout, sharing/invite UI, and Access Tokens
  behind `isStandalone()`.
- `.github/workflows/native-build.yml` — add the API build step ahead of packaging.
- `docs/desktop.md` — new section documenting standalone mode alongside the existing remote-client
  docs.

## Verification

- `pnpm --filter @everylist/desktop package` locally on each of macOS/Windows/Linux (or via the
  existing CI matrix) and confirm the packaged app: boots standalone mode from a clean `userData`
  dir, creates/reads/writes lists with the app fully offline (no network device), survives an app
  restart with data intact, and shuts down without leaving an orphaned server process (check via
  `ps`/Task Manager after quit).
- Confirm `better-sqlite3`'s native binary actually loads in the packaged (asar) build on each OS —
  this is exactly where the reference project's bug hid ("packaged app started no window at all");
  don't trust an unpackaged `electron .` dev run alone, since asar-unpacking issues only surface
  once packaged.
- Confirm the existing remote-mode desktop flow (`static-server.cjs`, port `41783`, cross-origin
  fetch) is completely unaffected — run through it end-to-end against a Docker server after this
  change lands.
- Confirm graceful shutdown: quit the app while a write is in flight, relaunch, verify no DB
  corruption (SQLite WAL should already make this safe, but verify rather than assume).
