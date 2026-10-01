# App changelog

User-visible changes to the app as it ships on Android. The Android app is a Capacitor
wrapper around the same web bundle the PWA serves, so an entry covers **both** Android-shell
changes and web/API changes that reach Android through that bundle — not just the native code.

Newest release goes at the top, under a `## vX.Y.Z` heading matching the release tag. Each
entry has two parts:

1. A **What's new** block, between `<!-- whats-new:start -->` and `<!-- whats-new:end -->`
   markers. This is what Google Play shows as the release notes, so it must be **plain text**
   (Play renders no Markdown), **under 500 characters**, and a genuinely *truncated* version of
   the release notes below — the one or two headline changes, not every bullet. It is extracted
   and validated by `scripts/android-whats-new.mjs` and published by `native-build.yml`; the
   release is refused if it's missing, oversized, or still contains Markdown.
2. The full release notes — a bullet per user-visible change with its PR number, matching the
   [GitHub Release notes](https://github.com/brianramseyau/EveryList/releases). Internal-only
   changes (CI, tests, tooling) belong in the GitHub notes, not here.

`pnpm prepare-release vX.Y.Z` refuses to bump versions until this file has an entry for
`vX.Y.Z`, so write (or update) the entry on the release branch before bumping.

## v1.8.0

<!-- whats-new:start -->
Connect AI assistants, scripts and the terminal to your lists. A built-in MCP server lets Claude and other AI tools read and edit lists, and a new command-line client (everylist) adds, lists and completes items from a script or cron job. Both use a scoped access token, so they only see the lists you grant.
<!-- whats-new:end -->

- **AI assistants (MCP)** (#275) — EveryList now runs a built-in Model Context Protocol server at `/mcp`, so Claude Desktop, Claude Code, Cursor and other MCP clients can read and edit your lists directly: discover lists, add/complete/remove items, search, and manage sub-tasks (11 tools plus a list resource). It's authenticated by a scoped Personal Access Token — mint one in Settings → Access Tokens — and each tool can only reach the lists that token is granted `viewer`/`editor` on, never more than your own membership. It ships inside the same container: upgrading the server is all it takes, with nothing extra to run. See the README's "AI assistants" section and `docs/mcp.md` for setup.
- **Command-line client** (#276) — a small, dependency-free `everylist` CLI for humans and scripts: `everylist add Groceries "milk"`, `everylist items Groceries`, `everylist search coffee`, `everylist complete Groceries milk`, and more. It's a plain REST client against `/api/v1`, authenticated with a scoped PAT, and it intersects the account's lists with the token's grants before resolving a list by name — so its view matches exactly what the server will allow. Every command takes `--json` for scripting, and it exits with distinct codes for success/runtime/usage/auth so it slots into a cron job or shell pipeline. Repo-local for now (not yet published to npm). See `docs/cli.md`.
- **API contract versioning** (#278) — under the hood the `/api/v1` HTTP contract now has a written compatibility policy, and `GET /api/v1/meta` reports the contract version (`apiVersion`) alongside the running image version. The API's own version (shown by `/docs` and the MCP server info) now only moves when the API actually changes, rather than tracking every release. No action needed for existing clients — additive only.

**Also in this release, with no user-visible app surface:** the release tooling now keeps the CLI's version in step with each release (#277), and the Android app's Play "What's new" notes are generated from this changelog (#274).

**Upgrading:** no schema changes and no server-side migration — pulling the `v1.8.0` image is enough for the web/PWA path. MCP is always available once the server is running (it needs no config; just mint a token and connect a client), and the CLI is a separate tool you install on the machine you'll run it from. Existing PATs, Alexa and Home Assistant integrations are unaffected.

Template for the next entry (replace `vX.Y.Z` and fill in; the example below is inside a fenced
code block and is ignored by the extractor, so it can stay here as a reference):

```markdown
## vX.Y.Z

<!-- whats-new:start -->
One or two sentences, plain text, under 500 characters.
<!-- whats-new:end -->

- **Headline change** (#000) — what changed and why it matters to the user.
- **Another change** (#000) — ...
```
