# MCP Gateway Secret Handling Policy

## Core Principle
**No secrets are ever stored in the `tools` or `tool_invocations` tables.**

The `config` block in the `tools` table only stores non-sensitive configuration such as `base_url`, `auth_type` (e.g., 'bearer', 'apiKey'), and standard header keys.

## Secret Management Strategy
1. **Environment Variables (MVP)**: For simple integrations, secrets are managed via service-level environment variables or mapped from traditional vault solutions.
2. **External Vault (Future)**: Managed secrets (like API keys for specific external tools) will be stored in a dedicated Secret Management Service or HashiCorp Vault.
3. **Reference-based Auth**: The Tool Registry stores a *reference* or *secret name*. The `mcp-gateway` resolves this reference at runtime using internal platform credentials or a dedicated service account.

## Redaction for Audit and History
1. **Low Sensitivity**: Full input/output may be logged in `tool_invocations`.
2. **Medium/High Sensitivity**: 
   - Full payloads are **NOT** stored in `tool_invocations`.
   - Only hashes or specifically allow-listed "safe" fields are stored.
   - The primary audit log (Audit Service) stores invocation IDs and hashes to ensure non-repudiation without data leakage.

## Enforcement
- All Tool definitions must pass a validation check that prevents the inclusion of keys that look like secrets (e.g., matching common patterns for private keys or high-entropy strings).
- Output validation schemas must explicitly define which fields are safe to log.
