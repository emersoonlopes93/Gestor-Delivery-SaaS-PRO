# Base image
FROM node:22-slim AS base

# Install required system libraries (e.g., for Prisma)
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Stage 2: Dependencies Skeleton
FROM base AS dependencies
RUN apt-get update -y && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json* ./

# Copiar package.json de todos os pacotes e apps para o pnpm resolver o workspace
COPY packages/ ./packages/
COPY apps/ ./apps/
# Limpar arquivos que não são package.json para manter o cache leve, exceto schema.prisma
RUN find packages -type f -not -name "package.json" -delete
RUN find apps -type f -not -name "package.json" -not -path "*/prisma/schema.prisma" -delete

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN pnpm install --frozen-lockfile

# Stage 3: Build
FROM dependencies AS builder
WORKDIR /app
COPY . .

# 1. Gerar Prisma Client na API (necessário para o build)
RUN pnpm --filter @gestor/api prisma:generate

# 2. Buildar todos os pacotes internos e apps
RUN pnpm --filter "@gestor/*" build

# Stage 4: Production (Runner)
FROM base AS runner
WORKDIR /app

# Copiar node_modules e artefatos de build do builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

# Copiar os pacotes internos buildados (necessários para o runtime)
COPY --from=builder /app/packages/ ./packages/

# Set the production environment
ENV NODE_ENV=production

# Expose Render standard ports
EXPOSE 3333

# Instalar Prisma CLI global para migrações no entrypoint
RUN npm i -g prisma

RUN chmod +x ./apps/api/docker-entrypoint.sh

# Start the application, passing Render's PORT to API_PORT dynamically
WORKDIR /app/apps/api
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pnpm", "start:api"]
