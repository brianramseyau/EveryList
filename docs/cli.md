# Command-line client (`everylist`)

EveryList ships a small command-line client for humans and scripts — add an item from a terminal,
seed a list from a cron job, or read the state of a shopping list without opening the app. It talks
to a running EveryList server over the same documented REST API (`/api/v1`) the web app uses, and
authenticates with a scoped [Personal Access Token](../README.md#personal-access-tokens) instead of
your login, so it can never see more than the list(s) you grant it.

The CLI is **not** part of the Docker image and doesn't need to run beside the server: it's a plain
HTTP client (like the Home Assistant integration), so point it at your instance from anywhere. It
never opens the SQLite file.

## Install & first run

The client lives in the monorepo at `apps/cli`. From a checkout:

```sh
pnpm install
pnpm --filter @everylist/cli build
node apps/cli/bin/everylist.mjs --help
```

Then connect it to your server with a token minted from **Settings → Access Tokens**:

```sh
everylist login --url https://your-everylist-host
# prompts for the token without echoing it
```

`login` verifies the token with a real request before saving anything, so a typo fails immediately
rather than on your next command. The config (server URL + token) is written to the platform config
directory — `~/.config/everylist/config.json` on Linux, `~/Library/Application Support/everylist/` on
macOS, `%APPDATA%\everylist\` on Windows — with **owner-only (0600) permissions**, since the token is
a real credential.

Prefer not to write a file? Set the environment variables instead, and every command picks them up:

```sh
export EVERYLIST_URL=https://your-everylist-host
export EVERYLIST_TOKEN=elt_…
```

A `--url`/`--token` flag on any command overrides both, for a one-off run against another server (the override wins over env _and_ the saved config).

> **Cleartext is refused by default.** The CLI sends your token as a bearer header, so it refuses
> plain `http://` to any host except loopback (`localhost`, `127.0.0.1`, `::1`). If you run a
> server on a trusted LAN over plain HTTP, set `EVERYLIST_ALLOW_INSECURE=1` to opt in — otherwise
> use `https://`.

## Commands

`<list>` and `<item>` arguments accept either an id or a name. A name is resolved against only the
lists the token was granted, so a name outside its scope behaves like a missing one (there's no way
to probe for lists you weren't given). If a name matches more than one list or item, the command
refuses rather than guessing — pass the id instead.

| Command                                                                     | What it does                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `everylist login --url <server>`                                            | Save and verify the server URL and token.                                   |
| `everylist token`                                                           | Show the configured token and its list grants.                              |
| `everylist lists`                                                           | List the lists this token can reach, with ids, roles, and open-item counts. |
| `everylist list <list>`                                                     | One list's details.                                                         |
| `everylist items <list> [--all]`                                            | A list's items (open only; `--all` includes checked).                       |
| `everylist add <list> <item> [--quantity] [--notes] [--price] [--deadline]` | Add an item, or re-open one that already exists.                            |
| `everylist complete <list> <item>`                                          | Check off an item.                                                          |
| `everylist uncheck <list> <item>`                                           | Re-open a checked item.                                                     |
| `everylist remove <list> <item>`                                            | Soft-delete an item (recoverable in the app).                               |
| `everylist search <query> [--list <list>]`                                  | Substring search across every list the token can reach.                     |

Every command accepts `--json` to print the raw API object instead of formatted text, which is what
you want when piping into `jq` or another script:

```sh
everylist lists --json | jq '.[] | .name'
```

### Examples

```sh
# What can this token see?
everylist lists

# Add two litres of milk to the Groceries list
everylist add Groceries Milk --quantity 2L

# Add an item with a price and a due date
everylist add Chores "Take out bins" --deadline 2026-10-01

# What's still open on the shopping list?
everylist items "Shopping List"

# Did I already buy coffee?
everylist search coffee

# Check it off once it's in the trolley
everylist complete Groceries Milk
```

## Authentication & safety

- **PAT-only.** The CLI sends a Personal Access Token as a bearer header; it cannot log in with your
  account password, and the token is capped below `owner`, so it can never mint or revoke tokens, or
  touch anything instance-wide (backups, server config, other users).
- **Scoped to its grants.** Every command reads `GET /tokens/me` first and intersects the account's
  lists with the token's per-list grants, so the CLI's view matches exactly what the API will let the
  token read — editing a token's grants in **Settings → Access Tokens** changes what the CLI sees
  immediately, with no reconfiguration.
- **The token is never printed in full.** `everylist token` and `login` show a mask (`elt_abc…wxyz`),
  and the token is only ever written to the `0600` config file or sent in the `Authorization` header.
- **Cleartext is refused.** A non-loopback `http://` server URL is rejected before the token is
  sent (`EVERYLIST_ALLOW_INSECURE=1` opts in for a trusted LAN), and redirects are never followed —
  a 3xx is reported instead, so an HTTPS server can't bounce your token or item data to a plain-HTTP
  host.
- **Each request has a 30s deadline**, so a stalled server can't hang a cron or CI run.
- **Throttled like any external client.** The `/api/v1/lists` surface the CLI uses is rate-limited
  per-token, the same limit the Home Assistant and Alexa integrations share.

## Exit codes

Scripts can branch on the failure kind:

| Code | Meaning                                                                                   |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | Success.                                                                                  |
| `1`  | A runtime or API failure (an item-not-found, a bad server response).                      |
| `2`  | Bad usage — an unknown command, a missing argument, an unparseable flag.                  |
| `3`  | An auth or config problem — no server/token configured, or the server rejected the token. |
