# Phase 22 — Desktop App Shell (Electron, macOS + Windows + Linux)

## Context

EveryList is a self-hosted, offline-first list app: an AdonisJS API plus a fully static SvelteKit
SPA (`adapter-static`, `fallback: '200.html'`), shipped as one Docker image and installable as a
PWA. Phase 13 (`PLAN_13_PHASE_NATIVE_APP_SHELL.md`) wrapped that same static bundle as native
iOS/Android apps via Capacitor, with **no app-logic duplication** — the native shell loads the
identical `apps/web/build` output and points it at a user-configured server URL.

This phase does the same thing for the desktop: **wrap the existing `apps/web` build in an Electron
shell** that talks to the user's own EveryList server over HTTP, exactly as the Android/iOS apps do.

**The desktop app does not host the API.** No AdonisJS process, no SQLite file, no migrations, no
bundled server. It is a client, not a deployment. That is the single most important difference from
the reference implementation this plan borrows from (see "Lessons learned" below) and it removes
most of that project's hard problems outright.

```
                     ┌──────────────────────────── user's own server ─┐
Docker (primary)     │  AdonisJS + static build, one origin           │
PWA / browser        │  same-origin fetch                            │
Capacitor iOS/Android│  cross-origin fetch → configured server URL    │
Electron desktop  ───┤  cross-origin fetch → configured server URL    │  ← this phase
                     └───────────────────────────────────────────────┘
```

## Prior art: `brianramseyau/ev-charging-log` — what carries over and what doesn't

That project ships an Electron build of a SvelteKit app (same Svelte 5 / Vite / SvelteKit stack,
same maintainer, same `electron-builder` + `electron-updater` toolchain). Its `PLAN.md` §11 and
`electron/main.cjs`, plus the six follow-up bug-fix commits it took to make the packaged build
actually work, are the source of the lessons below. **Its architecture is deliberately not copied**:
it uses `adapter-node` with server-side load functions hitting `better-sqlite3` directly, so its
Electron main process must `fork()` a real SvelteKit server per launch. EveryList's frontend is a
static SPA with a bearer-token API client, so none of that applies.

| Lesson from ev-charging-log                                                                                                                                                                                                                            | Applies here?                 | What this plan does                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native module (`better-sqlite3`) trapped in `app.asar` — packaged app started no window at all, needed `asarUnpack: ["**/*.node"]` (commit `1f7a6df`)                                                                                                  | **No**                        | No server, no native modules in the desktop bundle at all. Nothing to unpack, no per-OS/per-arch ABI rebuild, no `@electron/rebuild` step. The CI matrix still builds per-OS, but only for installer format reasons, not native code.                   |
| `adapter-node`'s CSRF origin check rejected every form action until `ORIGIN` was set (commit `e446c8e`)                                                                                                                                                | **No**                        | No SvelteKit server process. All writes are `fetch()` + bearer token to the remote API.                                                                                                                                                                 |
| SvelteKit's postbuild route analysis imports `hooks.server.ts` and needs a throwaway `DATABASE_URL` in CI (commit `a60fef4`)                                                                                                                           | **No**                        | Static build, no `hooks.server.ts`, no build-time DB.                                                                                                                                                                                                   |
| **`whenReady()` had no `.catch()` — a startup failure left the app in the dock with no window and no error, undiagnosable from a packaged build** (commit `6e112b8`)                                                                                   | **Yes**                       | §5: the whole boot chain is wrapped, failures go to `dialog.showErrorBox` with the real stack, and the local static server's own errors are captured, not swallowed.                                                                                    |
| **`electron-builder`'s default `buildResources` dir is `build/`, which collided with the app's own build output — silently fell back to Electron's default icon; `app.setName()` was never called so dev builds showed "Electron"** (commit `d32a6bb`) | **Yes**                       | §6: `directories.buildResources` points at `apps/desktop/resources`, never `build/`. `app.setName('EveryList')` is called explicitly. Icons come from `branding/` via the existing asset-generation approach.                                           |
| **`ELECTRON_BUILD=true vite build` is POSIX-only and fails on Windows runners** (commit `3709bd6`)                                                                                                                                                     | **Avoided entirely**          | §1 uses **runtime** desktop detection (a preload-injected flag), not a build-time env var, so there is no second web-bundle variant and no `cross-env`. One `pnpm --filter @everylist/web build` output serves Docker, PWA, Capacitor **and** Electron. |
| **`electron-builder`'s GitHub publisher defaults to `releaseType: "draft"` and silently skips every asset upload when the release already exists as non-draft — while reporting success** (commit `83842bf`)                                           | **Yes**                       | §7: desktop artifacts are built with `--publish never` and attached by the existing release job, so there is no second publisher racing it. If that's ever changed to `--publish always`, `releaseType: 'release'` is mandatory.                        |
| PWA service worker skipped for the Electron build ("redundant at best, a source of stale-asset bugs at worst", `PLAN.md` §11.2)                                                                                                                        | **Yes**                       | §4: SW registration is skipped when `isDesktop()`, same shape as the existing `!Capacitor.isNativePlatform()` gate in `+layout.svelte`.                                                                                                                 |
| `config.json` in `app.getPath('userData')` as the escape hatch for machine-specific config (`resolveDatabasePath`)                                                                                                                                     | **Yes, repurposed**           | §2: same file, same location, but the knob is the loopback **port**, not a database path.                                                                                                                                                               |
| CI matrix `macos-latest` / `windows-latest` / `ubuntu-latest`, one job per OS, `contents: write` + `GITHUB_TOKEN`                                                                                                                                      | **Yes**                       | §7, folded into the existing `native-build.yml` tag trigger rather than a separate workflow with its own release-creation dance.                                                                                                                        |
| `electron-updater` checking GitHub Releases at launch, no-op when unpackaged                                                                                                                                                                           | **No — deliberately dropped** | §8: Squirrel.Mac cannot update an unsigned `.app`, and there is no Apple Developer account. Ships a "check the latest release and open its page" action instead, so no platform gets an update button that cannot work.                                 |

Two further lessons come from EveryList's own Phase 13 rather than the reference project, and both
bite the desktop shell for the same reasons they bit Capacitor:

- **SPA fallback must serve `200.html`, not `index.html`** (`PLAN_13` §4). Capacitor's hard-coded
  `index.html` fallback served the prerendered `/` page for every deep route, which then ran its own
  "redirect to /lists" logic and broke every reload. Our own static server has no such constraint —
  §2 specifies the correct fallback order explicitly so we never reproduce it.
- **A subclass compiling and being referenced is not evidence it's the code actually running**
  (`PLAN_13`, iOS `SceneDelegate` postmortem). The desktop equivalent: verify the preload script is
  actually loaded and the flag actually reaches the renderer before trusting any `isDesktop()`
  branch — a typo'd `preload` path fails silently and every desktop branch quietly takes the web path.

## Locked decisions

- **Client only.** The desktop app never runs AdonisJS, never opens a database, never runs
  migrations. Server URL is runtime-configured through the existing `/server-setup` screen.
- **One web bundle.** No `ELECTRON_BUILD` build variant. Desktop-ness is detected at runtime from a
  preload-injected flag (`isDesktop()`), mirroring `Capacitor.isNativePlatform()`.
- **Feature parity with the Android app** is the target: same screens, same offline behavior
  (Dexie plus the mutation queue), same realtime sync, same settings — minus the things that are
  physically meaningless on a desktop (shake-to-undo, orientation lock, home-screen widget, install
  prompt).
- **All Electron code lives in `apps/desktop/`**, a sibling of `apps/android` / `apps/ios` /
  `apps/web` / `apps/api`. Nothing Electron-specific goes into `apps/web`, and the Docker build must
  stay untouched by it — see §0, which proves that with a real test rather than an assumption.
- **Unsigned builds** for every platform. There is no Apple Developer Program membership and no
  Authenticode certificate, and neither is worth buying for a self-hosted personal app. This is a
  locked constraint, not a deferred task — everything downstream (§8's update mechanism especially)
  is designed around it rather than pretending signing will arrive later.
- **No `electron-updater`.** Updates are a "new version available → open the release page" check
  against the GitHub Releases API. Squirrel.Mac refuses to update an unsigned `.app`, so shipping an
  auto-updater on macOS would be a button that cannot work. See §8.
- **Server version skew is a non-issue.** The desktop app requires a server at or after the release
  that adds §3's CORS entry; the app is early enough in its life that "upgrade your server first" is
  an acceptable, one-line release note rather than an architectural constraint. This is why the
  main-process API proxy in §2 stays rejected.
- **100% coverage where it's feasible to test.** The repo-wide gate stands for `apps/api`/`apps/web`;
  for `apps/desktop`, pure logic is fully covered and the Electron wiring that can only be exercised
  by actually launching an app is explicitly excluded with a stated reason (§9).
- **Targets:** macOS (`dmg` + `zip`, x64 + arm64), Windows (`nsis`, x64), Linux (`AppImage`, x64) —
  same matrix as the reference project.
- **Release trigger:** the existing `vX.Y.Z` tag flow (`.github/workflows/native-build.yml`), so one
  tag produces Docker image + Android + iOS + desktop artifacts.

## Scope

### 0. Where the Electron code lives, and why the Docker build is safe

The reference project keeps `electron/main.cjs` at its repo root only because it is a single-package
repo where the SvelteKit server _is_ the app. Nothing about `electron-builder` requires the shell to
sit next to the renderer it packages — `files` takes `{ "from": "../web/build", "to": "renderer" }`
mappings, and the renderer here is just a directory of static files. **`apps/desktop/` as a peer of
`apps/android`/`apps/ios` is both possible and the better fit**, matching the layout convention this
repo already uses for every other platform shell.

The real question is what a new pnpm workspace does to the Docker build. That was checked against
pnpm 10.33.0 (the version pinned in the root `packageManager`) with a scratch workspace reproducing
this repo's exact shape, rather than reasoned about:

- **A workspace package that is absent from the Docker build context does not break
  `pnpm install --frozen-lockfile`.** `docker/Dockerfile` copies only `apps/api/package.json` and
  `apps/web/package.json` before installing. With the third importer present in `pnpm-lock.yaml` but
  its directory missing from the context, pnpm reported `Lockfile is up to date, resolution step is
skipped` and exited 0. (An earlier draft of this plan asserted the opposite — it was wrong.)
- **It also installs none of that workspace's dependencies.** The missing importer's packages were
  simply not fetched. So the Docker builder stage never downloads Electron or `electron-builder`,
  and the image is unaffected in size, content and build time. **No Dockerfile change is required.**
- **pnpm 10 blocks Electron's binary download by default.** A plain `pnpm install` on a full checkout
  printed `Ignored build scripts: electron@38.8.6` and added ~8.6 MB of npm tarballs — not the
  ~150 MB runtime. The binary only downloads once `electron` is added to
  `pnpm-workspace.yaml`'s `onlyBuiltDependencies`, which is needed for local development and for the
  desktop CI job. Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` on the jobs that don't build the desktop app
  (`test.yml`, and `ci.yml`'s e2e/docker jobs) so they keep installing at today's cost.

That makes the in-workspace form of `apps/desktop` the recommended default: one install, one
lockfile, and `pnpm -r lint`/`typecheck`/`test` (and therefore `pnpm check`) pick it up automatically.

**If stricter isolation is ever wanted**, full exclusion also works and was verified: adding
`- "!apps/desktop"` to `pnpm-workspace.yaml`'s `packages` list removes the importer from the lockfile
entirely and drops its dependency tree from the root install. The cost is a second lockfile, a
separate install step for desktop development, and explicit wiring into `scripts/check.mjs` and CI,
since `pnpm -r` no longer sees it. Not worth it given the measurements above — but it is the escape
hatch if the desktop dependency tree ever starts causing trouble for the rest of the repo.

Either way, `apps/web` gains only the platform-detection module and the branch gates in §1/§4 —
ordinary app code with no Electron dependency, which stays inert for the Docker/PWA/Capacitor builds.

### 1. Runtime desktop detection (prerequisite for everything else)

The web codebase already has exactly one platform-branching primitive — `Capacitor.isNativePlatform()`.
Desktop needs a second one, and it must be _runtime_, not build-time, so a single `apps/web/build`
keeps serving Docker/PWA/Capacitor/Electron.

- `apps/desktop/preload.cjs`: `contextBridge.exposeInMainWorld('everylistDesktop', { ... })`, with
  `contextIsolation: true` and `nodeIntegration: false` (Electron defaults since v12/v5 — do not
  weaken them). Initially exposes `{ version: string, platform: NodeJS.Platform }` plus the IPC
  callbacks §5 needs.
- `apps/web/src/lib/platform/desktop.ts` (new):
  ```ts
  export function isDesktop(): boolean {
      return typeof window !== 'undefined' && Boolean(window.everylistDesktop);
  }
  export function desktopInfo(): { version: string; platform: string } | null { ... }
  ```
  with the same `typeof window !== 'undefined'` SSR/prerender guard `token.ts` and `server-url.ts`
  already use (these modules run under prerendering, in Node, with no `window`).
- `apps/web/src/app.d.ts`: declare `everylistDesktop` on `Window` so `svelte-check` stays clean.
- Everything the app currently branches on `Capacitor.isNativePlatform()` gets audited against
  `isDesktop()` — see §4 for the full table. Where the two behave identically (needs a server URL,
  no service worker, no install prompt), introduce a single helper rather than repeating
  `Capacitor.isNativePlatform() || isDesktop()` at eight call sites. Suggested:
  `isRemoteClient()` in the same module ("this build talks to a server over the network and must be
  told where it is").

**Verification that this is actually wired:** a visible, checkable signal — Settings' About section
shows `App <version>` for the desktop build (§4), which is empty/absent if the preload never ran.
Don't take "the branch compiled" as proof (Phase 13's `SceneDelegate` lesson).

### 2. How the renderer is served — a fixed-port loopback static server

This is the load-bearing decision of the phase, and it is **not** obvious.

**Chosen: an in-process HTTP static server bound to `127.0.0.1` on a fixed port, serving
`apps/web/build`, with the `BrowserWindow` loading `http://127.0.0.1:<fixed port>`.**

Rationale, in the order that actually drove the decision:

1. **Origin stability is non-negotiable.** EveryList keeps the server URL and the auth token in
   `localStorage` and the entire offline cache + pending-mutation queue in IndexedDB (Dexie). Both
   are keyed by origin. The reference project picks a **random free port every launch**
   (`getFreePort()` in its `main.cjs`) — harmless there, because all its state lives in a SQLite
   file the main process owns. Doing that here would silently wipe the configured server URL, the
   login token and every queued offline mutation on **every single launch**. The port must be fixed.
2. **`file://` is not viable.** `apps/web/vite.config.ts` sets `paths: { relative: false }` (a
   deliberate Phase 13 fix), so every asset is referenced as `/_app/...`, which under `file://`
   resolves against the filesystem root. `file://` also gives an opaque origin, breaking
   `localStorage`, and sends `Origin: null` on every API request.
3. **`http://127.0.0.1` avoids the mixed-content trap that bit the Android build.** A large share of
   self-hosted EveryList instances are reachable only over plain `http://` on a LAN. Chromium blocks
   `http://` subresource/`fetch` requests from a **secure** origin — that is precisely why
   `PLAN_13` §4 needed `MIXED_CONTENT_ALWAYS_ALLOW` in `MainActivity.java` for debug builds, because
   Capacitor serves its pages over `https://localhost`. A page served from `http://127.0.0.1` is not
   an HTTPS origin, so **no mixed-content blocking applies**, while loopback is still treated as a
   _potentially trustworthy_ origin by Chromium — so secure-context-only APIs keep working. A custom
   `app://` scheme registered with `secure: true` would reintroduce the Android problem for every
   plain-HTTP self-hoster; registered with `secure: false` it would lose secure-context APIs. Neither
   is worth it.
4. **No child process.** Unlike the reference project, the static server runs _inside_ the Electron
   main process — `await server.listen()`, no `fork()`, no `ELECTRON_RUN_AS_NODE`, no port polling,
   no stdout capture plumbing, no `before-quit` child kill.

**Implementation notes**

- Default port: a fixed value in the private range (proposal: **`41783`** — adjacent to nothing this
  project already uses; final value picked at implementation time after a quick "commonly used by X"
  check). Overridable via `<userData>/config.json` → `{ "port": 41783 }`, the same escape-hatch shape
  as the reference project's `databasePath`. **Document loudly** that changing the port changes the
  origin, which resets the local token/server URL/offline cache (server-side data is untouched).
- `app.requestSingleInstanceLock()` — a second launch focuses the existing window instead of racing
  for the port. Handle `second-instance`.
- On `EADDRINUSE` despite the lock: surface a real error dialog naming the port and the
  `config.json` override, not a silent failure.
- **Static file resolution order** (this is where Phase 13's SPA-fallback bug lives — get it right
  once here and it never recurs):
  1. exact file under `build/` → serve with the correct `Content-Type`;
  2. `<path>/index.html` if that exists (adapter-static writes prerendered routes this way);
  3. otherwise `build/200.html` — **never** `index.html`, which is the real prerendered `/` page and
     would run its own redirect logic (`PLAN_13` §4).
- Path traversal: resolve the request path against the build root and reject anything that escapes
  it. This server is loopback-only, but it is still a server.
- Hand-rolled (~80 lines, no new runtime dependency) rather than `sirv`/`express` — it needs exactly
  the four behaviors above, and hand-rolled code is trivially unit-testable (§9), which matters given
  the repo's 100% coverage gate.
- `mainWindow.loadURL('http://127.0.0.1:<port>/')` only **after** `listen` resolves.

**Rejected alternative — proxying `/api` through the main process** so the renderer stays
"same-origin" and no server-side CORS entry is needed: it would let the desktop app work against
_any_ existing EveryList server version, including ones predating §3, and could transparently accept
self-signed certs. Rejected because it means reimplementing SSE/Transmit streaming through a Node
proxy, an IPC handshake to tell main the server URL before the first request, and a second code path
that no other client uses. The cross-origin path is already proven in production by the Android app.
Revisit only if version-skew complaints actually materialize.

### 3. Server URL, CORS, and reachability

- **Server URL:** no new mechanism. `apps/web/src/lib/api/server-url.ts` and the `/server-setup`
  screen already do this for Capacitor; §1's `isRemoteClient()` extends the `+layout.svelte`
  first-launch redirect and the Settings "Server / Change" row to the desktop build. This is a
  ~3-line change per call site, not a feature.
- **CORS:** `apps/api/config/cors.ts` production `origin` is currently
  `['capacitor://localhost', 'https://localhost']`. Add the desktop origin. Recommended shape is a
  predicate rather than another literal, so the `config.json` port override and any future port
  change keep working **without requiring users to upgrade their server**:
  ```ts
  origin: app.inDev
    ? true
    : (origin) =>
        origin === 'capacitor://localhost' ||
        origin === 'https://localhost' ||
        /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
  ```
  Security note, stated honestly: this lets any page served from the user's own loopback interface
  make cross-origin requests to their EveryList server. Every EveryList API route the app uses
  authenticates with a bearer token from `localStorage` (`config/auth.ts`'s `api`/`pat` token
  guards), which a different loopback origin cannot read — so a CORS entry alone grants nothing. The
  `web` session guard also exists in config; before widening this, confirm in `apps/api/start/routes.ts`
  that no cookie-authenticated route is reachable this way, and keep the allowlist explicit
  (never `origin: true` in production).
- **Version skew: accepted, not engineered around.** A desktop app pointed at a server predating this
  CORS entry fails at the browser layer — `fetch` throws a bare `TypeError`, indistinguishable from
  "server down". The app is early enough in its life that requiring a server at or after this release
  is a release note, not a design problem, so no proxy/shim is built for it (§2's rejected
  alternative). Two cheap mitigations, both worth doing: state the minimum server version in the
  README's desktop section and in the release notes, and add one desktop-specific line to
  `/server-setup`'s existing "couldn't reach this server" warning (which already has a "Continue
  anyway" escape) pointing at the server-version requirement.
- **Self-signed HTTPS:** out of scope for v1. If it comes up, the hook is Electron's
  `app.on('certificate-error')` (an explicit, per-host user opt-in), **not** disabling `webSecurity`.

### 4. Reconciling the PWA/Capacitor feature layer with the desktop shell

Every existing `Capacitor.isNativePlatform()` call site, audited:

| Call site                                                                      | Desktop behavior                                                                                                                                                                                      | Change                                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+layout.svelte` — `/server-setup` redirect when no server URL                 | **Needed.** A fresh desktop install has no server and no token.                                                                                                                                       | Gate on `isRemoteClient()`                                                                                                                            |
| `+layout.svelte` — service worker registration (`!isNativePlatform()`)         | **Skip.** The bundle is served from local disk; a Workbox precache over a loopback origin adds nothing and reintroduces exactly the stale-asset class of bug the reference project's plan called out. | Gate on `!isRemoteClient()`                                                                                                                           |
| `+layout.svelte` — `App.addListener('appUrlOpen')` deep links (Android widget) | Not applicable.                                                                                                                                                                                       | Leave Capacitor-only                                                                                                                                  |
| `lib/pwa/install-prompt.ts` — `beforeinstallprompt`                            | Never fires in Electron; already a no-op.                                                                                                                                                             | No change                                                                                                                                             |
| `lib/pwa/update.ts` + Settings "Check for update" (shown when `!isNative`)     | The SW-based update check is meaningless. Desktop updates are §8's check-and-link against GitHub Releases.                                                                                            | Replace the row on desktop with §8's release check (implementation step 8), rather than leaving a gap                                                 |
| `lib/pwa/badge.ts`                                                             | Web Badging API is not reliably implemented in Electron's renderer. macOS dock / Windows taskbar badges come from `app.setBadgeCount` in main.                                                        | Phase-2 nice-to-have: an IPC channel. v1 may leave it a no-op                                                                                         |
| `lib/realtime.ts` — `appStateChange` resubscribe on resume                     | Desktop has no equivalent OS-level socket teardown; the browser's EventSource retry is sufficient. Optionally re-subscribe on window focus later.                                                     | Leave Capacitor-only                                                                                                                                  |
| `lib/shake.ts` — shake-to-undo                                                 | Physically meaningless. `canShake()` already returns false without a motion API.                                                                                                                      | Verify it degrades silently; hide the Settings toggle on desktop                                                                                      |
| `lib/orientation.ts` + Settings "Screen Orientation"                           | Meaningless on desktop.                                                                                                                                                                               | Hide the whole section when `isDesktop()`                                                                                                             |
| `lib/widget.ts` + Settings widget row (`isAndroid`)                            | Android-only.                                                                                                                                                                                         | No change                                                                                                                                             |
| `lib/open-external-link.ts` — note links                                       | **Needed, different mechanism.** Capacitor uses `Browser.open()`. In Electron, `target="_blank"` opens a _new Electron window_, not the system browser.                                               | §5's `setWindowOpenHandler` handles it at the shell level, so this module needs no desktop branch — but confirm by clicking a note link, don't assume |
| Settings About — `App.getInfo()` version row (`isNative && nativeInfo`)        | Show the desktop app version from the preload flag.                                                                                                                                                   | Extend the row                                                                                                                                        |
| `lib/reload.ts` "Refresh now" / pull-to-refresh                                | `Cmd/Ctrl+R` exists via the menu (§5), and the button still works.                                                                                                                                    | No change                                                                                                                                             |

Dexie/IndexedDB, the offline mutation queue, connectivity monitoring and Transmit/SSE all work
unchanged — they are ordinary browser APIs against a stable origin.

### 5. Electron main process: window, lifecycle, and the things that break if you skip them

`apps/desktop/main.cjs` (CommonJS, matching the reference project — Electron's main process entry
under a `"type": "module"` workspace needs `.cjs` unless ESM main is explicitly set up; not worth the
churn).

Responsibilities, in order:

1. `app.setName('EveryList')` — otherwise unpackaged dev runs show the npm package name in the macOS
   menu bar/dock (reference lesson `d32a6bb`).
2. `app.requestSingleInstanceLock()`; bail early / focus the existing window on `second-instance`.
3. Start the §2 static server; `await` it.
4. Create the `BrowserWindow`:
   - `webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }`.
   - Default size ~`1100×820`, `minWidth: 380`, `minHeight: 520`. The web layout is already
     responsive (`layout.css`'s `app-max-w` → `max-w-lg md:max-w-3xl lg:max-w-5xl`), so a desktop-width
     window renders sensibly without any CSS work in this phase.
   - **Window state persistence** (position/size/maximized) in `<userData>/window-state.json`.
     Restoring blind is a known footgun when a monitor is unplugged — clamp the restored rectangle to
     an actually-present display before applying it.
   - `backgroundColor` set to the app's `--color-paper` light value (`#f6f5f1`) so the window doesn't
     flash white before first paint; ideally read the persisted theme preference and use `#1b1d1f`
     for dark (the same two values `cap:assets` already uses).
   - `icon` set explicitly for the unpackaged dev run, plus `app.dock.setIcon` on macOS in dev
     (reference lesson `d32a6bb`).
5. `webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })`
   — note links and any `target="_blank"` open in the real browser instead of a chrome-less Electron
   window. Only allow `http:`/`https:` through to `openExternal`; deny everything else.
6. `will-navigate` guard: block any top-level navigation away from `http://127.0.0.1:<port>` and hand
   it to `shell.openExternal` instead. Without this, one stray link turns the app window into a
   browser with no address bar and no way back.
7. **Application menu.** On macOS, replacing the default menu without `role`-based Edit items breaks
   `Cmd+C/V/X/A` app-wide — a classic and very confusing Electron regression. Build a trimmed menu
   from roles: App/Edit (`undo/redo/cut/copy/paste/selectAll`), View (`reload`, `resetZoom`,
   `zoomIn`, `zoomOut`, `togglefullscreen`, plus `toggleDevTools` only when unpackaged), Window,
   Help. On Windows/Linux, hide the menu bar by default (`autoHideMenuBar`) but keep the accelerators.
8. `window-all-closed` → quit except on macOS; `activate` → recreate the window (standard macOS
   lifecycle, same as the reference project).
9. **Wrap the entire boot chain in `.catch()` → `dialog.showErrorBox(...)` with the real stack**
   (reference lesson `6e112b8` — this was the difference between "the app doesn't open and nobody
   knows why" and a one-minute diagnosis). Log to a file under `userData` too: a packaged GUI launch
   has no terminal to print to.

### 6. Packaging with `electron-builder`

`apps/desktop/package.json` (name `@everylist/desktop`, `private: true`, `main: "main.cjs"`), with
the `build` config either inline or in `electron-builder.yml`.

- `directories.buildResources: "resources"` — **never** the default `build/`. That default collided
  with the app build output in the reference project and silently produced an Electron-default icon
  (`d32a6bb`). We have the same collision risk because `apps/web/build` is the bundle we ship.
- `files`: the app's own `main.cjs`/`preload.cjs`/`package.json`, **plus the web bundle mapped in**:
  ```jsonc
  "files": [
    "main.cjs", "preload.cjs", "lib/**/*", "package.json",
    { "from": "../web/build", "to": "renderer" }
  ]
  ```
  Verify the `from`/`to` mapping actually lands (`asar list`) before trusting it; if it fights
  pnpm's symlinked workspace layout, fall back to a `prepackage` script that copies
  `apps/web/build` → `apps/desktop/renderer/` and list it as a plain glob. Either way the packaged
  path must be resolved from `__dirname`, never from `process.cwd()` (a Finder/Explorer launch has a
  cwd of `/`).
- `asar: true` is fine — **no `asarUnpack` needed**, because there are no native modules. This is the
  single biggest simplification versus the reference project (`1f7a6df`).
- Icons: generate `resources/icon.png` (1024px) from `branding/icon.svg`, the same source
  `cap:assets` already uses; `electron-builder` derives `.icns`/`.ico`/Linux PNGs from it. Add a
  small generation script (or extend the existing branding pipeline) rather than committing a
  hand-exported PNG that drifts from the SVG.
- `appId: 'au.brianramsey.everylist'` — matching `capacitor.config.ts`, with `productName: 'EveryList'`.
- `mac.identity: null` (unsigned, per locked decisions), `mac.category: 'public.app-category.productivity'`.
- Targets per the locked decisions.
- **Version:** `electron-builder` reads `version` from `apps/desktop/package.json`. That is a second
  source of truth next to the `vX.Y.Z` tag that `native-build.yml` already parses. Set it from the
  tag in CI (`npm version --no-git-tag-version` or a `--config.extraMetadata.version` flag) rather
  than hand-bumping a file that will inevitably drift.

**Repo-specific packaging gotchas (all new, none inherited from the reference project — it is a
single-package repo with npm, this is a pnpm workspace):**

- `pnpm-workspace.yaml`'s `onlyBuiltDependencies` allowlist: pnpm 10 blocks postinstall scripts by
  default, and **`electron`'s postinstall is what downloads the ~150 MB runtime binary**. Add
  `electron` (and anything else pnpm reports as blocked, e.g. `electron-builder`'s helpers) or the
  desktop app will fail to launch with a missing-binary error that looks nothing like the real cause.
- `pnpm dev` at the root is `pnpm -r --parallel dev`. **Do not name the desktop launch script `dev`**,
  or every `pnpm dev` spawns an Electron window. Use `start` / `desktop:dev`.
- `pnpm build` at the root is `pnpm -r build`. **Do not name the packaging script `build`** — a full
  `electron-builder` run on every root build is unacceptable. Use `package` / `dist`.
- `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` will now include this workspace (it has a
  `package.json`, unlike `apps/android`/`apps/ios`, which pnpm ignores). It needs real `lint`,
  `typecheck` and `test` scripts, and it is subject to the repo's 100% coverage gate — see §9.
- **`docker/Dockerfile` needs no change** — see §0, where this was tested rather than assumed. It
  copies only `apps/api/package.json` and `apps/web/package.json`, and pnpm 10 neither errors on the
  missing importer nor installs its dependencies. Deliberately **do not** add a
  `COPY apps/desktop/package.json` line: leaving it out is exactly what keeps Electron out of the
  image build. Still run one real local `docker build -f docker/Dockerfile .` immediately after the
  workspace lands (implementation step 1) to confirm it on this repo's actual lockfile.
- CI install time: once `electron` is in `onlyBuiltDependencies`, every workflow job's
  `pnpm install --frozen-lockfile` would pull the ~150 MB runtime. Set
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1` on the jobs that don't build the desktop app (`test.yml`,
  `ci.yml`'s e2e/docker jobs) and leave it unset only in the desktop matrix job. Without
  `onlyBuiltDependencies` the download is blocked everywhere by default, so the failure mode if this
  is forgotten is a slower CI job, never a broken one.

### 7. CI and release automation

Fold into the existing `.github/workflows/native-build.yml` (already `on: push: tags: ['v*.*.*']`,
already parses the tag, already has a `release` job attaching artifacts to the GitHub Release):

- New job `build-desktop`, `needs: [test, meta]`, matrix `[macos-latest, windows-latest, ubuntu-latest]`,
  `fail-fast: false`. Steps: checkout → pnpm/node → `pnpm install --frozen-lockfile` →
  `pnpm --filter @everylist/shared build` → `pnpm --filter @everylist/web build` →
  `pnpm --filter @everylist/desktop run package -- --publish never` with the version injected from
  `needs.meta.outputs.version_name`.
- Upload `apps/desktop/release/*` as an artifact (`if-no-files-found: error`), and add those paths to
  the existing `release` job's `files:` list so desktop artifacts land on the same GitHub Release as
  the APK/AAB/iOS zip. Installers only — with no `electron-updater` (§8) there is no `latest*.yml`
  or `.blockmap` metadata to attach, so `electron-builder`'s `publish` config can be omitted
  entirely.
- `--publish never` + attach-by-the-existing-job is deliberate: it sidesteps the reference project's
  `releaseType: 'draft'` trap (`83842bf`) entirely, because `electron-builder` never talks to the
  Releases API. If a `publish` block is ever added, `releaseType` **must** be `'release'` — the
  default `'draft'` silently skips every upload against an already-published release while still
  reporting success.
- Matrix builds per-OS not because of native modules (there are none) but because `dmg`, `nsis` and
  `AppImage` each need their own OS toolchain.
- macOS: build both `x64` and `arm64`. Do **not** rely on `--universal` unless it's actually
  verified — two arch-specific artifacts are the safer default.
- `-rc.N` tags: mirror the existing Android split — RC tags produce desktop artifacts attached to the
  prerelease, no publish/auto-update metadata concerns beyond that.
- Reuse the existing `test` job as a gate (`needs: test`) so a desktop build can't ship off a red commit.

### 8. Update checking — "check and link", not `electron-updater`

**Decision: no `electron-updater`, on any platform.** The reference project ships it, and this plan
deliberately diverges, because the constraint that makes it work is absent here:

- **Unsigned macOS builds cannot auto-update, full stop.** Squirrel.Mac (what `electron-updater`
  drives on macOS) requires a valid code signature, and there is no Apple Developer Program
  membership behind this project — Apple charges the same annual subscription regardless of whether
  the software is open source. An auto-updater on macOS would therefore be a button that cannot ever
  succeed, which is worse than not having one.
- Windows NSIS and Linux AppImage auto-update _would_ work unsigned, but shipping an updater on two
  of three platforms means two update code paths, two sets of release metadata
  (`latest*.yml`/`.blockmap`), and a support story that differs per OS — for an app whose actual data
  all lives on the user's own server and survives a reinstall untouched.

What ships instead: **a "check for updates" action that compares the running version against the
latest GitHub Release and, when a newer one exists, offers to open the release page in the system
browser** (`shell.openExternal`, per §5).

- Version source: the packaged app's own version, exposed to the renderer through the §1 preload
  flag.
- Where it lives: the Settings → About area, replacing the service-worker "Check for update" row
  that §4 hides on desktop, so the desktop build isn't simply missing an affordance the PWA has.
- Implementation: a single unauthenticated `GET /repos/<owner>/<repo>/releases/latest`. Handle rate
  limiting and offline by reporting "couldn't check right now" — never by throwing.
- Optionally run the same check once at launch (throttled to at most daily, persisted in
  `<userData>/config.json`) and surface it as an unobtrusive in-app notice, not a modal.

**Distribution caveats to document in the README regardless** — these are consequences of unsigned
builds, not of the update mechanism:

- **macOS Gatekeeper quarantine**: an unsigned, un-notarized `.dmg` downloaded from GitHub is blocked
  with "EveryList is damaged and can't be opened". The README needs the right-click → Open
  workaround (and/or `xattr -dr com.apple.quarantine /Applications/EveryList.app`).
- **Windows SmartScreen** will warn on an unsigned NSIS installer. Expected; document it.
- Updating means downloading the new installer and reinstalling. Nothing is lost: account data lives
  on the server, and the local cache/queue is rebuilt from it. The one thing worth calling out is
  that quitting with unsynced offline changes queued and then reinstalling could strand them —
  advise reconnecting once before updating.

### 9. Testing and coverage

`apps/desktop` becomes a pnpm workspace, so `pnpm -r test` picks it up. The repo-wide 100% gate
stands for `apps/api`/`apps/web`; here the target is **100% of what is feasible to test**, with the
untestable part named explicitly rather than quietly diluted. Structure the code so the split is
obvious:

- **Pure, testable modules** under `apps/desktop/lib/` with Vitest specs at 100%:
  - static-file resolution (exact file → `index.html` → `200.html` fallback, MIME mapping, path-traversal
    rejection) — this is where Phase 13's fallback bug would recur, so it gets real tests;
  - `config.json` reading (missing file, malformed JSON, invalid port, valid override) — mirroring
    `resolveDatabasePath`'s shape from the reference project, which had exactly these branches;
  - window-state clamping against available displays;
  - external-link allow/deny predicate;
  - §8's "is the latest release newer than this build" version comparison and its
    offline/rate-limited failure paths.
- **Thin, untestable Electron wiring** (`main.cjs`, `preload.cjs`) excluded from coverage in the
  workspace's Vitest config, with a comment stating why — the same precedent `apps/web` already sets
  for `+layout.svelte` and `src/routes/**/+page.ts`, and the `/* v8 ignore */` convention on
  `reload.ts` / `pwa/reset.ts`. The rule that keeps this honest: a file is only exclusion-eligible if
  it contains **no branching of its own** — it wires Electron objects together and delegates every
  decision to a covered module in `lib/`. The moment an `if` appears in `main.cjs`, that logic moves
  to `lib/` instead of widening the exclusion.
- Keep the workspace's coverage thresholds set to 100% over the _included_ files rather than lowering
  the numbers, so the excluded list stays the single visible record of what isn't tested.
- Web-side additions (`lib/platform/desktop.ts`, the `isRemoteClient()` gates, Settings changes) are
  ordinary `apps/web` code and must hit 100% like everything else — including the no-`window`
  prerender branch.
- **Manual verification checklist** (the Phase 13 lesson: device/real-run passes find what unit tests
  structurally cannot):
  1. Unpackaged run (`pnpm --filter @everylist/desktop start`) → app name and icon correct, window opens.
  2. First launch on a clean profile → lands on `/server-setup`, not a blank screen or `/login`.
  3. Point at a **plain-`http://` LAN server** → login succeeds (proves no mixed-content block).
  4. Point at an **`https://` server** → login succeeds (proves CORS entry landed).
  5. Realtime: change a list from a phone/browser → the desktop window updates without a reload.
  6. Offline: kill the network, check off items, restore the network → queue drains, no duplicates.
  7. Quit and relaunch → still logged in, same server, offline cache intact (**the origin-stability
     proof — this is the check that catches a regression back to a random port**).
  8. Deep route + `Cmd/Ctrl+R` on `/settings/sync` → stays on that page (the `200.html` fallback proof).
  9. Click a note link → opens the system browser, not an Electron window.
  10. `Cmd+C` / `Cmd+V` in an input on macOS (the menu-roles proof).
  11. Packaged build on each OS: installs, launches, and repeats 2–9.

### 10. Documentation

- `README.md`: a "Desktop app (Electron)" section mirroring the reference project's — what it is (a
  client, not a server), where to download, the Gatekeeper/SmartScreen caveats, the `config.json`
  port override and its data-reset consequence, and the minimum server version for the CORS entry.
- `AGENTS.md`: add any footgun this phase actually hits to "Known footguns" — the pnpm
  `onlyBuiltDependencies`/Dockerfile-workspace interaction is the likeliest candidate, and the
  origin-stability rule (never a random port) belongs there permanently.
- This plan file gets status annotations per section as work lands, matching how `PLAN_13` records
  `— done` / `— in progress`.

## Out of scope (explicitly)

- Code signing / notarization (macOS), Authenticode (Windows) — no developer accounts, by decision.
- `electron-updater` / in-place auto-update. §8 explains why, and what ships instead.
- Any desktop-specific UI redesign. The responsive layout is reused as-is; multi-pane/keyboard-first
  desktop UX is a separate phase if it's ever wanted.
- Tray icon, global shortcuts, OS notifications, launch-at-login.
- Bundling the API/Docker deployment into the desktop app. Deliberately never.
- Windows/Linux ARM builds, Snap/Flatpak/deb packaging, Microsoft Store / Mac App Store.
- Self-signed certificate trust UI.

## Risks and open questions

Three of the original open questions are now settled and recorded under "Locked decisions" — server
version skew (accepted), the update mechanism (check-and-link, no `electron-updater`), and the
coverage target (100% where feasible, with a named exclusion rule). What remains:

1. **Fixed port collision.** Rare but real, and the one failure that would look like the app is
   simply broken. Mitigated by the single-instance lock, an honest error dialog naming the port, and
   the `config.json` override. Choosing a port nothing else commonly binds matters; check the
   candidate against IANA's registry and the usual dev-tool defaults before locking it in.
2. **Coverage exclusion drift.** If the "pure logic vs Electron wiring" split turns out thinner than
   expected, the exclusion list could quietly grow to cover real logic. §9's no-branching rule is the
   guard — enforce it in review rather than trusting the threshold numbers.
3. **CI minutes.** Three more matrix jobs per tag. No mitigation needed, just an accepted cost;
   they're tag-triggered, not per-PR.
4. **Nothing here has been built yet.** Every §2 claim about Chromium's loopback/mixed-content
   behavior is well-established but unverified _in this app_. Implementation step 2 exists
   specifically to prove it early, against a real plain-HTTP LAN server, before anything is built on
   top of it.

## Implementation order (PR-sized steps)

Each step is independently reviewable, and steps 1–2 are the ones most likely to surface a surprise,
so they come first deliberately.

1. **Workspace skeleton + repo plumbing.** `apps/desktop/package.json` with `start`/`package`/`lint`/
   `typecheck`/`test` scripts, `onlyBuiltDependencies` entry, `ELECTRON_SKIP_BINARY_DOWNLOAD` in
   existing CI jobs, eslint/prettier config. No Dockerfile change (§0). **Green `pnpm check` and a
   green local `docker build -f docker/Dockerfile .` are the exit criteria for this step alone** —
   before any Electron code exists, so that if the Docker build ever does object to the new
   workspace, it surfaces in a PR that contains nothing else.
2. **Static server + window boot.** §2 + the §5 window/lifecycle basics + error dialog. Loads the
   already-built `apps/web/build` and shows the app against a manually-set server URL. Verify origin
   stability (relaunch → still logged in) here, not later.
3. **Desktop detection + web-side gates.** §1 and §4: `isDesktop()`/`isRemoteClient()`, `/server-setup`
   redirect, SW skip, Settings sections, About version row. Full test coverage on the web side.
4. **CORS.** §3, plus the `/server-setup` hint and README note. Small, but it's an API change to a
   production security config — its own PR.
5. **Menus, external links, navigation guard, window state.** The rest of §5.
6. **Packaging.** §6: `electron-builder` config, icons, local `dmg`/`nsis`/`AppImage` produced and
   manually verified per the §9 checklist.
7. **CI release job.** §7, verified end to end with an `-rc.N` tag before a real release tag.
8. **Update check + docs.** §8's check-and-link action and §10's README/AGENTS entries, with the
   unsigned-build caveats stated plainly rather than buried.

## Exit criteria

- A `vX.Y.Z` tag produces macOS (x64 + arm64), Windows and Linux desktop artifacts attached to the
  same GitHub Release as the Android/iOS builds, from a green `test` job.
- The packaged app on each platform completes the §9 manual checklist, including the offline,
  realtime, plain-HTTP-LAN, and relaunch-persistence cases.
- `pnpm check` is green with the new workspace included, and `apps/desktop/lib/` is at 100% with a
  short, justified exclusion list covering only branch-free Electron wiring.
- `docker build -f docker/Dockerfile .` still succeeds, with no Dockerfile change and no Electron in
  the image build.
- The README documents install, the unsigned-build caveats (Gatekeeper/SmartScreen), how updates work
  (download and reinstall), the port override, and the minimum server version.
