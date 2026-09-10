# EveryList

A mobile-first, offline-first shopping/task list app. This add-on runs the
same self-hosted image published for Docker/Unraid — one container, one
SQLite database, nothing else to configure.

## Installation

1. Start the add-on.
2. Open the Web UI (the link on the add-on's Info tab, or `http://<your-home-assistant>:3000/`).
3. Create your account from the app's sign-up screen — the first account
   created becomes the instance owner.

## Options

Both options are optional — leave them blank for a working zero-config
install.

- **`app_url`** — the public base URL you'll reach this instance at (e.g.
  `https://lists.example.com`), used to build absolute links in emails
  (password reset). Only needed if you're putting this behind a reverse
  proxy with a domain name; safe to leave blank for local/LAN access.
- **`app_key`** — pins the app's encryption/signing key. Leave blank and
  one is generated automatically on first start and persisted in this
  add-on's config storage, so it survives restarts and updates. Only set
  this if you're restoring onto a fresh install or intentionally rotating
  the key.

Everything else — public signups, outbound mail (SMTP), automated backups,
Alexa account-linking — is configured after first boot from inside the app
itself, under **Settings → Server settings** (visible to the instance
owner). See the main [README](https://github.com/brianramseyau/EveryList#server-settings-configconfigyaml)
for details.

## Data & backups

All data (the SQLite database, generated app key, and backups) lives under
this add-on's private config storage, independent of your Home Assistant
configuration. Back it up the same way you back up any other add-on's
data, or use EveryList's own built-in scheduled backups from
**Settings → Backups**.

## Support

Issues and questions: [github.com/brianramseyau/EveryList/issues](https://github.com/brianramseyau/EveryList/issues)
