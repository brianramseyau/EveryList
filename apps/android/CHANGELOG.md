# App changelog

User-visible changes to the app as it ships on Android. The Android app is a Capacitor
wrapper around the same web bundle the PWA serves, so an entry covers **both** Android-shell
changes and web/API changes that reach Android through that bundle — not just the native code.

Newest release goes at the top, under a `## vX.Y.Z` heading matching the **Android** version
(the `android-vX.Y.Z` release — Android has its own stream, independent of the server's `vX.Y.Z`
tag; see `foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md`). Each entry has two parts:

1. A **What's new** block, between `<!-- whats-new:start -->` and `<!-- whats-new:end -->`
   markers. This is what Google Play shows as the release notes, so it must be **plain text**
   (Play renders no Markdown), **under 500 characters**, and a genuinely *truncated* version of
   the release notes below — the one or two headline changes, not every bullet. It is extracted
   and validated by `scripts/android-whats-new.mjs` and published by `android-build.yml`; the
   release is refused if it's missing, oversized, or still contains Markdown.
2. The full release notes — a bullet per user-visible change with its PR number, matching the
   [GitHub Release notes](https://github.com/brianramseyau/EveryList/releases). Internal-only
   changes (CI, tests, tooling) belong in the GitHub notes, not here.

`pnpm prepare-android-release android-vX.Y.Z` refuses to bump versions until this file has an
entry for `vX.Y.Z`, so write (or update) the entry on the release branch before bumping.

## v1.8.3

<!-- whats-new:start -->
Category suggestions are better with longer item names. A distinctive word like "peckish" now outweighs a common one like "rice", so a new item can inherit the category of a similar earlier one instead of falling into Uncategorised. The old hard-coded keyword fallback is gone too, replaced by starter categories that seed the learned model, so renaming a category no longer breaks suggestions.
<!-- whats-new:end -->

- **Smarter learned category suggestions** (#288) — category suggestions now weight each word by how distinctive it is. A word only ever assigned to one category ("peckish") counts fully, while one spread across many ("rice") is down-weighted, so "Peckish Rice Crackers Original" can inherit Cookies & Biscuits from an earlier "Peckish rice crackers" instead of being pulled apart by the common word. Extra unmatched words remain harmless.
- **One categorization model, not two** (#291) — the old hard-coded runtime keyword fallback is gone. New lists bootstrap the learned model from single-word starter keywords when they're created, so renaming a seeded category no longer silently disables suggestions. Existing lists keep their current learned rows and are not backfilled; an item that was only ever categorised by the old fallback may start uncategorised until it's assigned once.

**Upgrading:** this build carries the updated web client (server `v1.8.2`). New-list starter seeding and the removal of the runtime fallback are server-side, so run server `v1.8.2` or later. No schema changes or migration on the Android side, and existing lists keep their learned data.

## v1.8.2

<!-- whats-new:start -->
Deadline reminders now stop when you tick an item off from the home-screen widget. Previously a reminder could still fire later even though the item was already completed.
<!-- whats-new:end -->

- **Widget check-offs cancel their reminder** (#286) — ticking an item off from the Android home-screen widget now cancels that item's scheduled deadline notification. Previously it only dismissed a notification that had already appeared, so an item completed hours early could still remind you later; the reminder is now also cleared from the plugin's stored schedule so a reboot can't restore it.

**Upgrading:** no server or web change, no schema changes and no migration — this is an Android-shell fix. Update the Android app; it works against existing `v1.8.1` (or later) servers.

## v1.8.1

<!-- whats-new:start -->
Backups are easier to manage on a phone: the file list no longer overlaps, and you can now delete an individual backup file with a confirmation step.
<!-- whats-new:end -->

- **Manage backups from your phone** (#283) — the backup file list in **Settings → Backups** no longer crams each file onto one line (badge, filename, size, date and a Download button) where it overlapped on a phone. Each backup is now a stacked card with its kind and full filename, a size/date line, and its own buttons. A new **Delete** button removes a single backup file after an inline confirmation ("Delete this backup? This can't be undone."); deleting is guarded against overlapping with a backup, a download, a schedule save or another delete, so the list can't be left showing a file that's already gone. Backed by a new `DELETE /api/v1/backup-settings/:filename` endpoint, admin-only like the rest of the backup routes.

**Upgrading:** no schema changes and no server-side migration — pulling the `v1.8.1` image is enough for the web/PWA path. On Android, this build carries the updated web bundle (server version `1.8.1`); no server change is required for the new UI, and the delete endpoint requires the `v1.8.1` (or later) server.

## v1.8.0

<!-- whats-new:start -->
Connect AI assistants, scripts and the terminal to your lists. A built-in MCP server lets Claude and other AI tools read and edit lists, and a new command-line client (everylist) adds, lists and completes items from a script or cron job. Both use a scoped access token, so they only see the lists you grant.
<!-- whats-new:end -->

- **AI assistants (MCP)** (#275) — EveryList now runs a built-in Model Context Protocol server at `/mcp`, so Claude Desktop, Claude Code, Cursor and other MCP clients can read and edit your lists directly: discover lists, add/complete/remove items, search, and manage sub-tasks (11 tools plus a list resource). It's authenticated by a scoped Personal Access Token — mint one in Settings → Access Tokens — and each tool can only reach the lists that token is granted `viewer`/`editor` on, never more than your own membership. It ships inside the same container: upgrading the server is all it takes, with nothing extra to run. See the README's "AI assistants" section and `docs/mcp.md` for setup.
- **Command-line client** (#276) — a small, dependency-free `everylist` CLI for humans and scripts: `everylist add Groceries "milk"`, `everylist items Groceries`, `everylist search coffee`, `everylist complete Groceries milk`, and more. It's a plain REST client against `/api/v1`, authenticated with a scoped PAT, and it intersects the account's lists with the token's grants before resolving a list by name — so its view matches exactly what the server will allow. Every command takes `--json` for scripting, and it exits with distinct codes for success/runtime/usage/auth so it slots into a cron job or shell pipeline. Repo-local for now (not yet published to npm). See `docs/cli.md`.
- **API contract versioning** (#278) — under the hood the `/api/v1` HTTP contract now has a written compatibility policy, and `GET /api/v1/meta` reports the contract version (`apiVersion`) alongside the running image version. The API's own version (shown by `/docs` and the MCP server info) now only moves when the API actually changes, rather than tracking every release. No action needed for existing clients — additive only.

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
