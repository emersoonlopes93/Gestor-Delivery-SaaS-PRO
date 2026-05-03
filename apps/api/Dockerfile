# Stage 1: Base
FROM node:20-alpine AS base
RUN npm i -g pnpm
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

# 1. Buildar todos os pacotes internos (ordem resolvida pelo pnpm)
RUN pnpm --filter "@gestor/*" build

# 2. Gerar Prisma Client na API
RUN pnpm --filter @gestor/api prisma:generate

# 3. Buildar a API
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
