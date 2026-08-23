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
# The scanned-page branch, and the one thing `next build` cannot see.
#
# src/lib/lab-ocr.ts reaches @napi-rs/canvas and tesseract.js through an
# `import()` whose specifier is a variable, so a document with a text layer
# loads no WASM and no native binary. Output file tracing follows imports it can
# read, a variable is not one, and neither package reached `.next/standalone`:
# the shipped image had no tesseract and no @napi-rs at all, every scanned page
# was refused by name, and F65's recognition half could not happen on the
# product. The refusal was honest, and honest is not the same as installed.
#
# So the closure is computed here, in a Linux stage, off the node_modules this
# build really installed, and copied whole. Computed rather than listed because
# @napi-rs/canvas resolves a different native binary per platform and
# tesseract.js pulls nine packages of its own: any COPY line naming them by hand
# is wrong on some machine. `--check` fails the build when a package is missing
# or when the native package resolved no binary for this architecture, which is
# what a build on the wrong platform looks like from in here.
FROM ${NODE_IMAGE} AS ocr
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY scripts/ocr-closure.mjs ./scripts/ocr-closure.mjs
COPY src/lib/lab-ocr.ts ./src/lib/lab-ocr.ts
RUN node scripts/ocr-closure.mjs --copy /opt/ocr-modules

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
# The optional recogniser, merged into the traced node_modules the standalone
# output brought with it. `node server.js` runs from /app, so an `import()` of
# tesseract.js resolves here exactly as it does in development.
COPY --from=ocr --chown=node:node /opt/ocr-modules ./node_modules

# The mount point for the file storage volume. Docker copies this ownership
# into a fresh named volume, so the app can write to it as node.
RUN mkdir -p /app/storage && chown node:node /app/storage

USER node
EXPOSE 3000

CMD ["node", "server.js"]
