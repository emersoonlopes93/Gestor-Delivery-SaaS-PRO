# Stage 1: Base
FROM node:20-slim AS base

# Install required system libraries
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates build-essential python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Setup pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Stage 2: Dependencies Skeleton
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json* ./

# Copiar package.json e tsconfig.json de todos os pacotes e apps
COPY packages/ ./packages/
COPY apps/ ./apps/
# Preservar tsconfig.json para permitir o correto link do workspace e scripts de build
RUN find packages -type f -not -name "package.json" -not -name "tsconfig.json" -delete
RUN find apps -type f -not -name "package.json" -not -name "tsconfig.json" -delete

RUN pnpm install --frozen-lockfile

# Stage 3: Build
FROM dependencies AS build
WORKDIR /app
COPY . .

# 1. Buildar dependências internas uma a uma (para visibilidade total no log do CI)
# A ordem segue o grafo de dependências (@gestor/types é a base)
RUN pnpm --filter @gestor/types build
RUN pnpm --filter @gestor/utils build
RUN pnpm --filter @gestor/config build
RUN pnpm --filter @gestor/auth build
RUN pnpm --filter @gestor/core build

# 3. Gerar Prisma Client (necessário para os tipos no build da API)
RUN pnpm --filter @gestor/api prisma:generate

# 4. Buildar a API
RUN pnpm --filter @gestor/api build

# Stage 4: Production
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# Copiar node_modules e artefatos de build
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

# Copiar os pacotes internos buildados (necessários para o runtime)
COPY --from=build /app/packages/ ./packages/

# Instalar Prisma CLI global
RUN npm i -g prisma

RUN chmod +x ./apps/api/docker-entrypoint.sh

EXPOSE 3333

WORKDIR /app/apps/api
ENTRYPOINT ["./docker-entrypoint.sh"]
