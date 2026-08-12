# Local-dev-only image used by docker-compose.yml. Not published; the
# production image is docker/Dockerfile.
FROM node:24-bookworm-slim

# build-essential + python3: required to compile better-sqlite3's native
# addon (node-gyp) inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app
