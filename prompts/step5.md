Cool — **TypeScript + realm-per-tenant** changes Step 5 quite a bit. Below is a **revised Step 5** that’s technically feasible and reproducible, with prompts tailored for that model.

---

# 🧩 STEP 5 (REVISED) — Identity & Tenancy with Keycloak Realm-per-Tenant (TypeScript)

## What “realm per tenant” means for your platform

* Each tenant (org/department group) gets its **own Keycloak realm**
* Realms isolate:

  * users
  * roles
  * groups
  * client configs
* Your services still run in one platform, so you must decide how to:

  * discover which realm to validate JWTs against
  * fetch the right JWKS per realm
  * prevent realm spoofing

**Hard rule:** tenant_id cannot come from a header alone. It must be **derived from the token issuer** (realm) or a verified claim.

---

## ✅ Deliverables at end of this step

* Keycloak base realm (platform) for ops/admin (optional but recommended)
* Automated realm provisioning:

  * create realm for tenant
  * create clients, roles, mappers
  * seed default users/groups
* TS middleware that:

  * validates JWT signature using the **realm’s JWKS**
  * maps token → actor consistently
* tenant-service that provisions realms via Keycloak Admin API
* all identity operations are audited + authorized

---

# 📁 PROMPT PACK — STEP 5 (TypeScript, Realm-per-Tenant)

## PROMPT 5.1 — Identity Contract for Realm-per-Tenant

```
Create /shared/IDENTITY_CONTRACT.md for a Keycloak realm-per-tenant model.

Must include:
- Tenant identity source of truth:
  - tenant_id is derived from realm name (preferred) OR from a required claim validated against issuer
- JWT issuer format examples:
  - http://localhost:8080/realms/<tenant_realm>
- Required claims:
  - sub, roles (realm roles), preferred_username/email
- Optional claims:
  - department_id (only if you want departments inside a realm)
- Mandatory header:
  - X-Purpose (required for governed operations)
- Forbidden:
  - trusting X-Tenant-Id without matching it to token issuer

Include a “Token → AuthorizeRequest.actor mapping” section.

Output file content only.
```

## PROMPT 5.2 — Define Realm Naming + Tenant Metadata Strategy

```
Create /shared/TENANT_REALM_STRATEGY.md defining:

- Realm naming convention:
  - tenant-<slug> (e.g., tenant-demo, tenant-nasa, tenant-fbi)
- Mapping rules:
  - tenant_id = <slug> or full realm name (choose one, justify)
- How services determine tenant realm:
  - parse token issuer (iss)
  - extract realm segment safely
- Security controls:
  - allowlist realm prefix 'tenant-'
  - reject tokens from unknown realms
  - cache realm JWKS per issuer with TTL

Output file content only.
```

## PROMPT 5.3 — Keycloak “Platform Admin Realm” (Optional but Recommended)

```
Create /infra/keycloak/platform-realm-import.json defining a Keycloak realm named "platform".

Purpose:
- Only for platform operators (platform_admin) to create tenants/realms.
- Contains confidential client "platform-services" used by backend services to call Keycloak Admin APIs.

Include:
- realm role: platform_admin
- client: platform-services (confidential)
- service account enabled
- minimal mappers

Also add /infra/keycloak/README.md with exact startup/import steps.

Output files and content.
```

## PROMPT 5.4 — Update docker-compose for Keycloak Import (Platform Realm)

```
Update /infra/docker-compose.yml to import the platform realm on startup.

Requirements:
- Mount platform-realm-import.json into Keycloak container
- Use env vars for admin username/password
- Keep it Apple Silicon compatible
- Keep ports minimal

Output only the updated Keycloak section and any new files.
```

## PROMPT 5.5 — Implement tenant-service (Realm Provisioning via Admin API)

```
Implement tenant-service in TypeScript using the shared service template.

Core endpoint:
- POST /tenants

Behavior:
- Authorize action: tenant.create (call policy-service)
- Write audit events: REQUEST, AUTHZ_DECISION, TENANT_CREATED
- Provision a new Keycloak realm for the tenant using Keycloak Admin REST API:
  - realm name: tenant-<slug>
  - create clients:
    - admin-console (public)
    - platform-services (confidential) OR tenant-services (confidential)
  - create realm roles:
    - tenant_admin, officer, supervisor, auditor
  - create default groups (optional):
    - /departments/<dept> if you want departments in realm
  - configure token mappers:
    - include roles
    - optionally include department_id
- Persist tenant metadata in Postgres:
  - tenant_id
  - realm_name
  - issuer_url
  - created_at

Constraints:
- Do not store passwords in DB
- Store Keycloak client secrets in env/secret manager later; for now store securely in Postgres encrypted OR output them once and require manual injection into .env (choose one and document)

Output:
- tenant-service code
- SQL migration
- Dockerfile
- example curl request/response
```

## PROMPT 5.6 — Implement “Create User in Tenant Realm” Endpoint

```
Extend tenant-service with:
- POST /tenants/{tenant_id}/users

Behavior:
- Identify realm from tenant metadata (Postgres)
- Authorize action: user.create
- Create user in that realm via Keycloak Admin API
- Assign realm roles (tenant_admin/officer/supervisor/auditor)
- Set temporary password or send required-actions (recommended):
  - REQUIRE: UPDATE_PASSWORD on first login
- Audit: USER_CREATED with user_id + roles (no password logging)

Output:
- endpoint implementation
- request/response schema
- example curl
```

## PROMPT 5.7 — JWT Validation Middleware (Multi-Issuer / Multi-Realm)

```
Update /shared/sdk/service-template/ JWT middleware in TypeScript to support realm-per-tenant.

Requirements:
- Extract issuer (iss) from token WITHOUT trusting headers
- Validate issuer matches allowed pattern:
  - /realms/tenant-*
- Fetch JWKS from <iss>/protocol/openid-connect/certs
- Cache JWKS per issuer with TTL
- Validate:
  - signature
  - expiry
  - issuer exact match
  - audience (configurable)
- Build actor:
  - actor_id = sub
  - roles[] from realm_access.roles or resource_access (document mapping)
  - tenant_id derived from realm name
- Fail closed if:
  - issuer is unknown or malformed
  - JWKS fetch fails
  - required claims missing

Output:
- middleware code
- README with how to configure allowed issuers/audiences
```

## PROMPT 5.8 — Seed “Demo Tenant Realm” Automatically

```
Create /infra/keycloak/seed_demo_tenant.ts that:

- Calls tenant-service POST /tenants to create tenant 'demo'
- Creates demo users:
  - tenant_admin
  - officer
  - supervisor
  - auditor
- Prints login instructions (no secrets in logs except temporary passwords if required)

Requirements:
- Idempotent (safe to rerun)
- Uses platform realm service credentials to call tenant-service or Keycloak Admin API

Output:
- script + README
- Makefile target: make seed-demo
```

---

# ✅ Step 5 Acceptance Checklist (Realm-per-Tenant)

You can move on only if:

* [ ] `make up` imports the **platform** realm successfully
* [ ] `make seed-demo` creates `tenant-demo` realm and demo users
* [ ] You can login into `tenant-demo` realm and obtain a JWT
* [ ] Any backend service can validate JWTs from **multiple issuers** (tenant realms)
* [ ] `tenant_id` is derived from token issuer realm (not only header)
* [ ] All tenant/user provisioning calls are:

  * authorized via policy-service
  * written to audit ledger

---

## Quick warning (so you don’t get surprised later)

Realm-per-tenant is awesome for isolation, but you must handle:

* **JWKS caching per realm** (performance)
* **realm lifecycle** (disable/delete, rotation)
* **client secret management** cleanly

This is still totally doable — just needs discipline.

 