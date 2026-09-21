# Changelog

## v1.6.2

Updates from v1.5.0 (the add-on skipped v1.5.1–v1.6.1, so this covers all of
them). **Upgrading:** automatic, additive database migrations run on first
boot (sub-tasks, per-user last-active time, and one-time repairs of stale
store/category references on items); no foreign keys or table rebuilds.

- **Sub-tasks** — give any list item its own checklist, with an optional
  auto-complete of the parent (per-list toggle, off by default).
- **User impersonation** — the primary account can "View as" another user from
  Manage users (view-only, 1 hour), and Manage users shows each user's last
  active time.
- **Autocomplete finds every item** — suggestions now cover a list's whole item
  history, ordered by when you last used something, instead of only the 50 most
  recently created names.
- **No more duplicate items** — bulk import, favorites and Alexa now reuse an
  existing item by name (reopening a checked one, restoring a deleted one)
  instead of creating a second copy; deleting an item also unchecks it.
- **Items no longer vanish** after a store is detached from a list or a
  category is deleted, and "add to top" is respected on web and Alexa.
- **Reschedule on deadline notifications** and a prompt before discarding
  unsaved edits.
- **Alexa** follow-up commands ("open a list", then "add …") now use the list
  you just opened.
- Android widget access tokens are managed one-per-device (shown under
  "Managed" in Access Tokens), and the "Re-enable shake to undo?" banner is gone.

See the [full EveryList release notes](https://github.com/brianramseyau/EveryList/releases/tag/v1.6.2)
for everything else in this release.

## v1.5.0

First stable release of the EveryList Home Assistant add-on.

- **Home Assistant Add-on** — install and run EveryList as a Home Assistant
  add-on: one container, one SQLite database, opened through Home
  Assistant's own Ingress panel by default (no separate port to forward),
  with an optional direct-access port for LAN/automation use.
- **Sign in with Home Assistant** — link an EveryList account to a Home
  Assistant username from Settings so you don't need a separate password:
  opening EveryList through the Ingress panel while logged into Home
  Assistant as the linked user signs you in automatically with no login
  screen at all, or sign in manually as a different linked Home Assistant
  account (validated against Home Assistant's own accounts via Supervisor)
  — useful on a shared/kiosk browser.
- Fixes for Ingress troubleshooting controls breaking under iframe
  embedding, and for the setup wizard flashing the home splash on fresh
  instances.

See the [full EveryList release notes](https://github.com/brianramseyau/EveryList/releases/tag/v1.5.0)
for everything else in this release.
