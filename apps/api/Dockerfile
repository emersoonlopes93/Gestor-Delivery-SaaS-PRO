FROM node:20-alpine

WORKDIR /app

COPY pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/

RUN npm install -g pnpm

# Instala dependências do workspace e garante prisma CLI
RUN pnpm install --frozen-lockfile --prod=false && pnpm add -w prisma

COPY . .

# Gera Prisma Client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Build da API
RUN pnpm --filter @gestor/api build

EXPOSE 3333

CMD ["sh", "-c", "pnpm --filter @gestor/api prisma:migrate:deploy && pnpm --filter @gestor/api start:prod"]
