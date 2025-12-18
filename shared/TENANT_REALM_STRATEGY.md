# TENANT_REALM_STRATEGY.md

## Realm Naming Convention
- **Format**: `tenant-<slug>`
- **Constraint**: `<slug>` must be URL-safe, lowercase, alphanumeric, and unique.
- **Examples**:
  - `tenant-demo`
  - `tenant-nasa`
  - `tenant-fbi`

## Tenant ID Mapping
- **Rule**: The `tenant_id` used in the platform is the **Full Realm Name** (e.g., `tenant-demo`).
- **Justification**: Using the full realm name (e.g. `tenant-demo`) as the system-wide `tenant_id` avoids ambiguity. It makes it trivial to map `tenant_id` back to the Keycloak Realm and Issuer URL without needing a lookup table or string parsing logic in every service.

## Service Resolution Logic
How a service determines which Tenant Realm to validate against:

1. **Extract Issuer**: Parse the `iss` claim from the Bearer token.
   - Example: `http://localhost:8080/realms/tenant-demo`
2. **Safely Extract Realm**:
   - Parse the URL and take the last segment of the path.
   - Verify it matches the pattern `tenant-*`.
3. **Validation**:
   - If the issuer does not look like a valid tenant realm URL, reject the token.

## Security Controls
1. **Allowlist Prefix**:
   - Only accept tokens from realms starting with `tenant-` (strictly for tenant workloads).
   - Platform services may accept `platform` realm tokens.
2. **Reject Unknown Realms**:
   - Tokens from `master` or arbitrary realms are rejected by default.
3. **JWKS Caching**:
   - **Constraint**: You MUST cache the JWKS (JSON Web Key Set) for each realm issuer.
   - **TTL**: Cache for at least 10 minutes.
   - **Purpose**: Prevents performance degradation and denial-of-service from verifying every request against the IdP.
