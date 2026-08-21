# syntax=docker/dockerfile:1

# Node 24, not the host's Node 26. Next.js 16.3.2 carries two open Node 26
# defects (vercel/next.js #96165 truncating RSC streams, #97492 on the removed
# SlowBuffer), and crypto.argon2Sync landed in Node 24.7, so node:24-slim at
# 24.19 satisfies both ends. The official with-docker example pins the same
# line.
ARG NODE_IMAGE=node:24-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Inside the Linux stage, so @next/swc-linux-arm64-gnu is what resolves.
RUN npm ci --include=dev

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build reads no configuration. Everything the app needs is read per
# request at runtime, which is what F7 measures.
RUN npm run build

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# node:24-slim already carries the unprivileged node user at uid 1000.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# The generated SQL, read at runtime by the programmatic migrator. drizzle-kit
# never enters this image.
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

# The mount point for the file storage volume. Docker copies this ownership
# into a fresh named volume, so the app can write to it as node.
RUN mkdir -p /app/storage && chown node:node /app/storage

USER node
EXPOSE 3000

CMD ["node", "server.js"]
