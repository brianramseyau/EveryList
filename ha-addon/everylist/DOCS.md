# EveryList

A mobile-first, offline-first shopping/task list app. This add-on runs the
same self-hosted image published for Docker/Unraid — one container, one
SQLite database, nothing else to configure.

## Installation

1. Start the add-on.
2. Open EveryList via **Ingress** — proxied entirely through Home
   Assistant's own domain, so a reverse proxy fronting only Home Assistant
   itself (no separate port to forward) still reaches it. This is the
   default, on with no configuration. Two things worth knowing:
   - Home Assistant offers a **"Show in sidebar"** toggle for any
     Ingress-enabled add-on — Settings → Add-ons → EveryList → Info — to
     pin EveryList in the sidebar instead of opening it from the Add-on
     Store page each time.
   - Since EveryList is a client-side app, refreshing the browser or
     opening a direct link to a sub-page (e.g. a specific list) *while
     inside* the Ingress view can land outside Home Assistant's proxied
     path and 404 — reopening EveryList from Home Assistant always
     returns you to a working state.
3. Want direct access too (no Home Assistant in the loop at all — plain
   LAN access, or an automation/script hitting the API directly)? The web
   UI's port is **off by default**, specifically so it doesn't land on
   port 3000 and collide with another common self-hosted app already
   using it. Turn it on from Settings → Add-ons → EveryList → Network —
   we suggest mapping it to **3333**, but any free port works.
4. Create your account from the app's sign-up screen — the first account
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
