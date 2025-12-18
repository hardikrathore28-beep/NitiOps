# IDENTITY_CONTRACT.md

## Identity Source of Truth
- **Tenant Identity**:
  - The `tenant_id` must be derived from the **token issuer (iss)**.
  - Specifically, it corresponds to the realm name (e.g., `tenant-nasa` -> `nasa`).
  - **Strict Rule**: Ideally, determining the tenant from `X-Tenant-Id` header without validating against the token issuer is **FORBIDDEN**. The issuer is the source of truth.

## JWT Issuer Format
- Format: `http://<keycloak-host>/realms/<realm-name>`
- Examples:
  - `http://localhost:8080/realms/tenant-demo`
  - `https://auth.nitiops.com/realms/tenant-prod-main`

## Required Claims
The following claims are **MANDATORY** in the JWT access token:
1. `sub`: Unique user ID (immutable).
2. `iss`: Issuer URL (must match the expected realm pattern).
3. `realm_access.roles`: List of roles assigned to the user within the realm.
4. `preferred_username` or `email`: Human-readable identifier.

## Optional Claims
- `department_id`: If departments are modeled as groups or custom attributes within Keycloak.

## Mandatory Headers
- `X-Purpose`: Required for all governed operations (e.g., `audit.log`, `policy.evaluate`).

## Forbidden Patterns
- **Do NOT** trust `X-Tenant-Id` header for authorization if it conflicts with the token's `iss`.
- **Do NOT** accept tokens from unknown or allowlisted realms.

## Token → AuthorizeRequest.actor Mapping

When converting a JWT into an `AuthorizeRequest.actor` for Policy/Audit:

| AuthorizeRequest Field | Source in JWT / Context |
| :--- | :--- |
| `actor.actor_id` | `sub` claim |
| `actor.actor_type` | `user` (default) or `service-account` if applicable |
| `actor.roles` | `realm_access.roles` |
| `tenant_id` | Derived from `iss` (e.g., `tenant-demo` from `.../realms/tenant-demo`) |
| `actor.department_id` | `department_id` claim (if present) or `null` |
