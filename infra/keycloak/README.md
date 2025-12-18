# NitiOps Keycloak Infrastructure

This directory contains the configuration for the Keycloak Identity Provider (IdP).

## Platform Realm (`platform`)

The `platform-realm-import.json` file is designed to be imported on startup to bootstrap the platform.

### Defined Entities
- **Realm**: `platform` (The management realm for NitiOps operators)
- **Role**: `platform_admin` (Super-admin role)
- **Client**: `platform-services`
  - **Type**: Confidential
  - **Service Accounts**: Enabled
  - **Secret**: `platform-services-secret` (Use this for backend service-to-service auth)
- **User**: `admin`
  - **Password**: `admin`
  - **Roles**: `platform_admin`

## Startup Steps

1. **Ensure Docker is running**.
2. **Start Keycloak**:
   The `docker-compose.yml` is configured to mount the import file and import it on startup.
   ```bash
   make up
   # OR
   docker-compose -f ../docker-compose.yml up -d keycloak
   ```
3. **Verify Import**:
   Check the logs to ensure the import was successful.
   ```bash
   docker-compose -f ../docker-compose.yml logs -f keycloak
   ```
   You should see messages indicating the realm `platform` was imported.

4. **Access Admin Console**:
   - URL: `http://localhost:8080`
   - Login: `admin` / `admin` (This might log you into Master or Platform depending on how you access, but the import defines admin in the Platform realm).

## Managing Tenants

Use the `tenant-service` to provision new tenants (realms). It uses the `platform-services` client credentials to authenticate against this `platform` realm to perform administrative tasks.

## Seeding Demo Tenant

To verify the setup and populate a demo environment, run:

```bash
make seed-demo
```

This script (`seed_demo_tenant.ts`) acts as an external orchestrator that:
1.  Authenticates as the `platform-services` client.
2.  Calls the **Tenant Service** to create a `demo` tenant (and its underlying Keycloak Realm).
3.  Calls the **Tenant Service** to provision `tenant_admin`, `officer`, `supervisor`, and `auditor` users in that realm.

This works strictly via the API, validating the `tenant-service` -> `keycloak` integration.
