FROM node:20-alpine

WORKDIR /app

# Copia lockfile e package.json da raiz e da API
COPY pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/

RUN npm install -g pnpm

# Instala dependências da raiz e da API
RUN pnpm install --frozen-lockfile --prod=false

# Copia todo o código
COPY . .

# Gera Prisma Client usando pnpm exec
RUN pnpm exec prisma generate --schema=apps/api/prisma/schema.prisma

# Build da API
RUN pnpm --filter @gestor/api build

EXPOSE 3333

# Start com migrations + produção
CMD ["pnpm", "--filter", "@gestor/api", "prisma:migrate:deploy", "&&", "pnpm", "--filter", "@gestor/api", "start:prod"]
