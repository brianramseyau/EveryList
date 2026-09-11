# Changelog

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
