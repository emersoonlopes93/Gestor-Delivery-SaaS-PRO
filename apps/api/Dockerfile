FROM node:20-alpine

WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod=false

COPY . .

RUN pnpm --filter @gestor/api prisma:generate --schema=apps/api/prisma/schema.prisma
RUN pnpm --filter @gestor/api build

EXPOSE 3333
CMD pnpm --filter @gestor/api prisma:migrate:deploy && pnpm --filter @gestor/api start:prod
