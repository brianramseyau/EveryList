# Running the production image

EveryList ships as a single self-contained container — one process serves both the API and the built static frontend on one port. No configuration is required to boot it:

```bash
docker run -d \
  --name everylist \
  -p 3000:3000 \
  -v /path/to/appdata:/config \
  ghcr.io/brianramseyau/everylist
```

`PUID`/`PGID` default to `99`/`100` (Unraid's `nobody`/`users`) and can be overridden; an `APP_KEY` is generated on first boot and persisted to `/config/app_key` if you don't supply one; database migrations run automatically against `/config/everylist.sqlite3` on every start, so a fresh volume and version upgrades both just work. An [Unraid Community Applications template](../docker/unraid-template.xml) is included.

## Server settings (`/config/config.yaml`)

Most non-core settings — public signups, outbound mail (SMTP), and Alexa account-linking — don't require an env var + redeploy at all: they can be edited at runtime from **Settings → Server settings**, visible only to the instance owner (user id 1). Changes are written to `config.yaml` in the same `/config` volume as the database and backups, and take effect immediately with no restart, including SMTP settings.

An env var always wins over `config.yaml` when both are set, so nothing changes for existing deployments unless you actually open the new settings page. A handful of core, boot-time vars stay env-only and are never exposed there: `DATABASE_FILENAME`, `SESSION_DRIVER`, `LIMITER_STORE`, `NODE_ENV`, `PORT`, `HOST`, `APP_KEY`, `LOG_LEVEL`, `PUID`/`PGID`, and the build-metadata vars.

If `/config` is mounted **read-only** — e.g. a Kubernetes `ConfigMap`/`Secret` volume, the standard way to manage config declaratively instead of through a UI — EveryList detects this and shows the resolved settings read-only, with saving disabled, rather than failing silently or crashing on write. Mount the file at `/config/config.yaml` and it's picked up on boot the same as a UI-written one; hand-edit it directly to change it.

## Image tags

| Tag       | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| `nightly` | Latest build off `main` — bleeding edge, no stability guarantee |
| `vX.Y.Z`  | Exact release, never moves                                      |
| `vX`      | Latest release within major version `X`                         |
| `latest`  | Latest stable release                                           |
