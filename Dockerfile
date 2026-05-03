# Base image
FROM node:20-slim AS base

# Install required system libraries (e.g., for Prisma)
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Builder stage
FROM base AS builder

COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages in order (types -> core -> other dependencies)
RUN pnpm --filter @gestor/types build
RUN pnpm --filter @gestor/core build
RUN pnpm --filter @gestor/config build
RUN pnpm --filter @gestor/auth build
RUN pnpm --filter @gestor/utils build

# Generate Prisma Client explicitly for the API
RUN pnpm --filter @gestor/api prisma:generate

# Build the API
RUN pnpm --filter @gestor/api build

# Runner stage
FROM base AS runner

WORKDIR /app

# Copy the entire workspace from builder to retain symlinks for monorepo packages.
COPY --from=builder /app ./

# Set the production environment
ENV NODE_ENV=production

# Expose Render standard ports
EXPOSE 3333

# Start the application, passing Render's PORT to API_PORT dynamically
CMD API_PORT=${PORT:-3333} pnpm start:api
