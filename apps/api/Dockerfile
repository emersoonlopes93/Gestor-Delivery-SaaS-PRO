FROM node:22-slim AS base

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Stage 2: Dependencies
FROM base AS dependencies
RUN apt-get update -y && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json* ./
COPY packages/ ./packages/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma/ ./apps/api/prisma/
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN pnpm install --frozen-lockfile

# Stage 3: Build API
FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter @gestor/api prisma:generate
RUN pnpm --filter @gestor/api build

# Stage 4: Runner
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
COPY --from=builder /app/apps/api/clean_db.js ./apps/api/clean_db.js

ENV NODE_ENV=production
EXPOSE 3333

RUN npm i -g prisma@5.22.0
RUN chmod +x ./apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pnpm", "start:api"]
