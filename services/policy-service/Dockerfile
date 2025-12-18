FROM node:22-alpine

WORKDIR /app

# Copy shared sdk
COPY shared/sdk/service-template /app/shared/sdk/service-template

# Copy service
COPY services/policy-service /app/services/policy-service

# Install dependencies and build shared
WORKDIR /app/shared/sdk/service-template
RUN npm install && npm run build

# Install dependencies and build service
WORKDIR /app/services/policy-service
RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]
