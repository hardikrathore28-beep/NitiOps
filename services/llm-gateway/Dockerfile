FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy shared packages
COPY shared ./shared

# Copy service code
COPY services/llm-gateway ./services/llm-gateway

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @nitiops/llm-gateway...

# Build
WORKDIR /app/services/llm-gateway
RUN pnpm run build

ENV PORT=3006
CMD ["node", "dist/index.js"]
