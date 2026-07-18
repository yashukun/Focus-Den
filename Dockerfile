# ── Stage 1: build the frontend ─────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
# .git is dockerignored, so the UI's version stamp can't read the commit hash
# itself — pass it in: docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD)
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: runtime — one process serves the API + the built frontend ──────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/focus-den.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY server/tsconfig.json ./server/
# The server imports the shared core (validation) straight from src/core.
# The root package.json must come along — its "type": "module" is what makes
# those files load as ES modules.
COPY package.json ./
COPY src/core ./src/core
COPY --from=build /app/dist ./dist

# SQLite lives on a mounted volume so data survives redeploys. Run as the
# unprivileged node user; /data must be writable by it.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787

# JWT_SECRET must be provided at runtime (the server refuses to start without
# it in production): docker run -e JWT_SECRET=... / fly secrets set JWT_SECRET=...
CMD ["./server/node_modules/.bin/tsx", "server/src/index.ts"]
