# Policy Pack

This directory contains the Open Policy Agent (OPA) Rego policies for the Governed AI Enablement Platform.

## Structure

- `bundles/`: Contains the policy bundles.
  - `base.rego`: Entry point, default deny, and common helpers.
  - `api_access.rego`: Rules for API endpoint permissions.
  - `rag_access.rego`: Rules for RAG (retrieval) access/chunk filtering.
  - `tool_access.rego`: Rules for calling MCP tools.
  - `agent_access.rego`: Rules for invoking AgentTools.
  - `workflow_access.rego`: Rules for workflow management.
- `tests/`: Unit tests for the policies.

## Philosophy

- **Deny by default**: All actions are denied unless explicitly allowed.
- **Attribute-based Access Control (ABAC)**: Decisions are based on actor roles, resource attributes (sensitivity, jurisdiction), and context.

## Usage

### Local Development (Hot Reload)

The OPA container is configured to mount this directory at `/policy`.
Changes to `.rego` files in `bundles/` will be automatically detected and reloaded by OPA.

**To verify changes:**
1. Edit a policy file (e.g., `bundles/api_access.rego`).
2. Save the file.
3. OPA will reload immediately.
4. Send a request to `policy-service` or query OPA directly.

**Direct OPA Query (Debugging):**
```bash
curl -X POST http://localhost:8181/v1/data/main/response -d '{
  "input": {
    "tenant_id": "test",
    "actor": {"roles": ["admin"]},
    "action": "api.test",
    "resource": {},
    "purpose": "debug",
    "context": {}
  }
}'
```

### Running Tests
Use the OPA CLI (if installed locally) to run tests:
```bash
opa test ./bundles ./tests -v
```
