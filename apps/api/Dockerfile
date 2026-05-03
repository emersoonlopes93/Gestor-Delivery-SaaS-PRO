# Stage 1: Base
FROM node:20-alpine AS base
RUN npm i -g pnpm
WORKDIR /app

# Stage 2: Dependencies
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copiar todos os package.json para garantir que o pnpm consiga resolver o workspace
# No modo monorepo, o lockfile depende de todos os pacotes definidos no workspace.yaml
COPY apps/ ./apps/
COPY packages/ ./packages/

# Remove os arquivos de código para manter o cache das dependências limpo
# Mas mantemos os package.json. (Opcional, mas pnpm install precisa deles)
RUN pnpm install --frozen-lockfile

# Stage 3: Build
FROM dependencies AS build
COPY . .
RUN pnpm --filter @gestor/api prisma:generate
RUN pnpm --filter @gestor/api build

# Stage 4: Production
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules

# Precisamos do prisma CLI no runtime para o migrate deploy
RUN npm i -g prisma

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3333

ENTRYPOINT ["./docker-entrypoint.sh"]
