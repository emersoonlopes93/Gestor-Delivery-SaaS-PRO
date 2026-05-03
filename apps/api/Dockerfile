# Stage 1: Base
FROM node:20-slim AS base

# Install required system libraries (e.g., for Prisma)
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Setup pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Stage 2: Dependencies Skeleton
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copiar package.json de todos os pacotes e apps para o pnpm resolver o workspace
COPY packages/ ./packages/
COPY apps/ ./apps/
# Limpar arquivos que não são package.json para manter o cache leve
RUN find packages -type f -not -name "package.json" -delete
RUN find apps -type f -not -name "package.json" -delete

RUN pnpm install --frozen-lockfile

# Stage 3: Build
FROM dependencies AS build
WORKDIR /app
COPY . .

# 1. Gerar Prisma Client primeiro (necessário para o build da API)
RUN pnpm --filter @gestor/api prisma:generate

# 2. Buildar todos os pacotes internos e apps
RUN pnpm --filter "@gestor/*" build

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
