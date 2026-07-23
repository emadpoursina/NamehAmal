#
# Multi-stage production image for NamehAmal (Next.js standalone + Prisma SQLite).
# Bump NODE_VERSION when upgrading Node LTS: https://nodejs.org/

ARG NODE_VERSION=24.13.0-slim

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

# better-sqlite3 needs a native compile toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --no-fund

# ============================================
# Stage 2: Build Next.js (standalone)
# ============================================
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Throwaway SQLite file so generate/migrate/build can touch the DB if needed
ENV DATABASE_URL="file:./build.db"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate \
  && npx prisma migrate deploy \
  && npm run build

# ============================================
# Stage 3: Production runner
# ============================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data .next \
  && chown node:node /data .next

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3060
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/nameh-amal.db"

# Isolated Prisma CLI (avoids reinstalling the full app dependency tree)
WORKDIR /opt/prisma-cli
RUN --mount=type=cache,target=/root/.npm \
  npm init -y >/dev/null \
  && npm install prisma@7.8.0 dotenv --no-audit --no-fund \
  && chown -R node:node /opt/prisma-cli

WORKDIR /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Standalone server + traced runtime deps
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Native SQLite driver (file tracing can miss .node bindings)
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=node:node /app/node_modules/@prisma/adapter-better-sqlite3 ./node_modules/@prisma/adapter-better-sqlite3

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 3060

VOLUME ["/data"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
