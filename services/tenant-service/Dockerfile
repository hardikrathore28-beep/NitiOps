FROM node:22-alpine

WORKDIR /app

# Copy shared sdk
COPY shared/sdk/service-template /app/shared/sdk/service-template
COPY shared/schemas /app/shared/schemas

# Copy service
COPY services/tenant-service /app/services/tenant-service

# Install dependencies and build shared
WORKDIR /app/shared/sdk/service-template
RUN rm -f package-lock.json && npm install && npm run build

# Install dependencies and build service
WORKDIR /app/services/tenant-service
RUN rm -f package-lock.json && npm install
RUN npm run build

EXPOSE 3003

CMD ["node", "dist/index.js"]
