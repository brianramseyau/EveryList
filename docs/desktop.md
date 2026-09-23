# Desktop app (Electron)

Every `vX.Y.Z` tag also attaches macOS (Intel + Apple Silicon), Windows, and Linux desktop builds to the [GitHub Release](https://github.com/brianramseyau/EveryList/releases). By default this is **a client, not a bundled deployment** — it loads the exact same web build as everyone else, served from a local loopback HTTP server, and points it at whatever EveryList server you configure on first launch via `/server-setup`. See `foundational/PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md`.

- **Requires a server running this release or later** — the desktop app needs a CORS entry (`apps/api/config/cors.ts`) that predates-it servers don't have. If login fails immediately with no more specific error, upgrade your server first.
- **Builds are unsigned.** There's no Apple Developer Program membership or Authenticode certificate behind this project.
  - **macOS**: Gatekeeper blocks the downloaded `.dmg` with "EveryList is damaged and can't be opened." Right-click the app → **Open**, or run `xattr -dr com.apple.quarantine /Applications/EveryList.app`.
  - **Windows**: SmartScreen will warn on the unsigned installer — click "More info" → "Run anyway."
- **Updates are "check and link," not automatic.** Settings → About has a "Check" button that compares your version against the latest GitHub Release and links to the download if one exists — there's no in-place auto-updater (an unsigned macOS build can't use one at all). Updating means downloading the new installer and reinstalling; nothing is lost, since your data lives on the server and the local offline cache rebuilds from it. If you have unsynced offline changes queued, reconnect once before updating so they flush first.
- **The loopback port is fixed** (default `41783`), not randomized — it's part of the app's stored origin, alongside your server URL, login token, and offline cache. Overriding it (via a `config.json` file in the app's data directory, `{ "port": 41784 }`) resets all of those; only do it if the default port is actually unavailable on your machine.

## Standalone mode

`/server-setup` also offers **"Use EveryList on this device only"** — a one-time, first-run choice (see `foundational/PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md`) that embeds the same AdonisJS + SQLite server Docker runs directly in the app, on a separate fixed loopback port (`41790`), with no self-hosted server needed at all.

- **Loopback-only, single-user.** There's no server URL to configure, and the setup wizard is skipped entirely — the app auto-provisions the instance owner with a placeholder identity on first boot. Sharing/invite UI, Access Tokens, Alexa, and logout are all hidden, since none of them can do anything useful with no reachable network and exactly one user.
- **A one-time choice.** Switching an existing installation between standalone and "connect to my own server" isn't supported in the app. To go back, quit EveryList and delete `mode.json` from the app data directory (reinstalling alone doesn't remove it — the mode marker lives in your app data directory, not the install itself). Your standalone data in `server/everylist.sqlite3` stays on disk either way.
- **Your data lives at `<app data directory>/server/everylist.sqlite3`**, in the same format Docker uses — copying that file into a Docker `/config` volume is a supported (manual) migration path if you outgrow standalone mode later.
- **Packaged builds are larger** than the thin-client-only builds that shipped before this feature, since they now bundle a production AdonisJS build and a native `better-sqlite3` rebuilt per OS/arch.
