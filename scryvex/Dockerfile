ARG BUILD_FROM=node:24-bookworm-slim

# Stage 1: Builder
FROM ${BUILD_FROM} AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Copy all source files
COPY package.json pnpm-workspace.yaml ./
COPY server/package.json server/
COPY sdk/package.json sdk/
COPY frontend/package.json frontend/
# Install dependencies
RUN pnpm install

# Copy the rest of the source code
COPY . .

# Build the project (assuming standard TS build script in root/server)
RUN pnpm run build

# Stage 2: Production
FROM ${BUILD_FROM}

ENV NODE_ENV=production

# Install required system dependencies for Scryvex Pro
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    postgresql \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable corepack in production as well
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy build artifacts and package configuration
COPY --from=builder /build/package.json /build/pnpm-workspace.yaml ./
COPY --from=builder /build/server/package.json ./server/
COPY --from=builder /build/sdk/package.json ./sdk/
COPY --from=builder /build/server/dist ./server/dist
COPY --from=builder /build/frontend/dist ./frontend/dist

# Install only production dependencies
RUN pnpm install --prod

# Copy initialization script
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD [ "/run.sh" ]
