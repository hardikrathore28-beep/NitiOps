FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy shared packages
COPY shared ./shared

# Copy service code
COPY services/mcp-gateway ./services/mcp-gateway

# Install dependencies (filtered)
RUN pnpm install --frozen-lockfile --filter mcp-gateway...

# Build service
RUN pnpm run build --filter mcp-gateway

WORKDIR /app/services/mcp-gateway
CMD ["node", "dist/index.js"]
