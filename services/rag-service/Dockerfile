FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy shared packages
COPY shared ./shared

# Copy service code
COPY services/rag-service ./services/rag-service

# Install dependencies (filtered)
RUN pnpm install --frozen-lockfile --filter rag-service...

# Build service
RUN pnpm run build --filter rag-service

WORKDIR /app/services/rag-service
ENV PORT=3005
CMD ["node", "dist/index.js"]
