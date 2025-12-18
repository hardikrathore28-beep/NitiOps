FROM node:22-alpine

WORKDIR /app

# Copy shared sdk
COPY shared/sdk/service-template /app/shared/sdk/service-template
COPY shared/schemas /app/shared/schemas

# Copy service
COPY services/audit-service /app/services/audit-service

# Install dependencies and build shared
WORKDIR /app/shared/sdk/service-template
RUN rm -f package-lock.json && npm install && npm run build

# Install dependencies and build service
WORKDIR /app/services/audit-service
RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]
