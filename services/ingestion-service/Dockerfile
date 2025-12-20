FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy shared packages
COPY shared ./shared

# Copy service code
COPY services/ingestion-service ./services/ingestion-service

# Install dependencies (filtered)
RUN pnpm install --frozen-lockfile --filter ingestion-service...

# Build service
RUN pnpm run build --filter ingestion-service

WORKDIR /app/services/ingestion-service
CMD ["node", "dist/index.js"]
