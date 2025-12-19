FROM node:22-alpine

WORKDIR /app

# Copy shared sdk (including dist)
COPY shared/sdk/service-template /app/shared/sdk/service-template
COPY shared/sdk/governed-http /app/shared/sdk/governed-http
COPY shared/constants /app/shared/constants
COPY shared/schemas /app/shared/schemas

# Copy service (including dist)
COPY services/tenant-service /app/services/tenant-service

# Patch package.json files to replace workspace:* with relative file paths
# governed-http: depends on service-template (../service-template) and constants (../../constants)
RUN sed -i 's|"@nitiops/service-template": "workspace:\*"|"@nitiops/service-template": "file:../service-template"|g' /app/shared/sdk/governed-http/package.json
RUN sed -i 's|"@nitiops/constants": "workspace:\*"|"@nitiops/constants": "file:../../constants"|g' /app/shared/sdk/governed-http/package.json

# Install dependencies for shared modules (to satisfy Node resolution from symlinked/file locations)
WORKDIR /app/shared/sdk/service-template
RUN rm -f package-lock.json && npm install --omit=dev

WORKDIR /app/shared/sdk/governed-http
RUN rm -f package-lock.json && npm install --omit=dev

# Install dependencies (production only, no build)
# We install in the service directory, npm will resolve local paths
WORKDIR /app/services/tenant-service
RUN rm -f package-lock.json && npm install --omit=dev

EXPOSE 3003

CMD ["node", "dist/index.js"]
