# EveryList production image.
#
# Single Node process serving /api/v1/* and the prebuilt SvelteKit static
# assets on one port, packaged behind an s6-overlay init (LSIO-style
# PUID/PGID remap + APP_KEY persistence) so `docker run` with no flags at
# all and only a /config mount is a valid, working invocation. See
# foundational/PLAN.md §5.
#
# Build from the repo root: docker build -f docker/Dockerfile .

# ---------------------------------------------------------------------------
# deps: full monorepo install (dev deps included) — shared by every build
# stage below so pnpm's content-addressable store is only populated once.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps

# build-essential + python3: required to compile better-sqlite3's native
# addon (node-gyp) for the workspace install below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build-web: static SvelteKit build (adapter-static). Most routes are
# prerendered (see apps/web/src/routes/+layout.ts); routes with dynamic
# params unknown at build time (e.g. /lists/[id]) fall back to a client-
# rendered 200.html shell — see apps/web/vite.config.ts and the SPA
# fallback route in apps/api/start/routes.ts.
# ---------------------------------------------------------------------------
FROM deps AS build-web
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @everylist/shared build
RUN pnpm --filter @everylist/web build

# ---------------------------------------------------------------------------
# build-api: compiled AdonisJS build, with the web build copied into
# apps/api/public so AdonisJS's own build step bundles it as a static asset
# (see apps/api/adonisrc.ts metaFiles + config/static.ts). Deliberately
# stops short of the production `pnpm install` — apps/api/build still lives
# under /app here, which has the workspace's pnpm-workspace.yaml as an
# ancestor, so pnpm would treat that install as workspace-scoped (and abort
# non-interactively trying to reconcile all 4 projects) instead of the
# standalone install AdonisJS's own build output expects. See prod-deps.
# ---------------------------------------------------------------------------
FROM deps AS build-api
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY --from=build-web /app/apps/web/build apps/api/public
RUN pnpm --filter @everylist/shared build
RUN pnpm --filter @everylist/api build

# ---------------------------------------------------------------------------
# prod-deps: production-only node_modules for the self-contained build
# output, installed in a fresh directory with no pnpm-workspace.yaml
# ancestor so pnpm treats it as the standalone project it actually is
# (AdonisJS's own documented deploy step — see `node ace build`'s summary).
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS prod-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /srv/build
COPY --from=build-api /app/apps/api/build .
# `node ace build` copies apps/api/package.json's dependencies and
# devDependencies into this standalone package.json verbatim. Strip
# devDependencies before installing — production has no business installing
# them anyway. @everylist/shared is a real runtime dependency (see the
# import in app/controllers/items_controller.ts) but its "workspace:*"
# specifier can't be resolved by pnpm once copied outside the pnpm
# workspace (no pnpm-workspace.yaml ancestor here), and pnpm validates that
# specifier before `--prod` gets a chance to skip anything. Strip it too and
# vendor the already-built package straight into node_modules below instead
# of asking pnpm to install it.
RUN node -e "const fs=require('node:fs'); const p=JSON.parse(fs.readFileSync('package.json')); delete p.devDependencies; delete p.dependencies['@everylist/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2))"
RUN pnpm install --prod
COPY --from=build-api /app/packages/shared/package.json node_modules/@everylist/shared/package.json
COPY --from=build-api /app/packages/shared/dist node_modules/@everylist/shared/dist

# ---------------------------------------------------------------------------
# release: minimal runtime image — no build toolchain, no pnpm workspace,
# just Node, s6-overlay, and the self-contained apps/api/build output.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS release

ARG S6_OVERLAY_VERSION=3.2.0.2
ARG APP_VERSION=nightly
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown

# Install s6-overlay (curl/xz-utils are build-time-only, purged after).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    xz-utils \
    ca-certificates \
    && ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in \
    amd64) S6_ARCH=x86_64 ;; \
    arm64) S6_ARCH=aarch64 ;; \
    *) echo "unsupported architecture: $ARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/s6-overlay-noarch.tar.xz \
    "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
    && curl -fsSL -o /tmp/s6-overlay-arch.tar.xz \
    "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" \
    && tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-arch.tar.xz \
    && rm -rf /tmp/*.tar.xz \
    && apt-get purge -y curl xz-utils && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Baked-in default account, remapped to PUID/PGID at container start by
# docker/root/etc/cont-init.d/10-remap-user (see that script), so the
# exact ID baked in here doesn't matter — no -u/-g pin, since
# node:24-bookworm-slim already ships a "node" user/group at GID/UID 1000.
RUN groupadd appuser && useradd -g appuser -M -s /usr/sbin/nologin appuser

WORKDIR /app
COPY --from=prod-deps --chown=appuser:appuser /srv/build /app/build
COPY docker/root/ /

# Unraid's "nobody"/"users" defaults — see docker/unraid-template.xml and
# foundational/PLAN.md §5's zero-config startup rule. APP_KEY is
# deliberately absent here: docker/root/etc/cont-init.d/20-app-key
# generates and persists one to /config/app_key on first boot if it isn't
# supplied.
ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production \
    LOG_LEVEL=info \
    APP_URL=http://0.0.0.0:3000 \
    SESSION_DRIVER=cookie \
    LIMITER_STORE=database \
    DATABASE_FILENAME=/config/everylist.sqlite3 \
    PUID=99 \
    PGID=100 \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    BUILD_DATE=${BUILD_DATE}

VOLUME /config
EXPOSE 3000

# Lets Docker (and anything watching container health — Unraid, a reverse
# proxy's upstream check, a rolling-restart script) know when the app is
# actually serving, not just that the process started — s6-overlay's init
# can take a moment (migrations, APP_KEY generation) before AdonisJS is
# listening. Uses node's built-in fetch instead of curl/wget: curl is
# purged above once s6-overlay is installed, and this avoids adding wget
# just for the check.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/meta').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/init"]
