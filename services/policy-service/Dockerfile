FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy shared packages
COPY shared ./shared

# Copy service code
COPY services/policy-service ./services/policy-service

# Install dependencies (filtered)
RUN pnpm install --frozen-lockfile --filter policy-service...

# Build service
RUN pnpm run build --filter policy-service

WORKDIR /app/services/policy-service
CMD ["node", "dist/index.js"]
