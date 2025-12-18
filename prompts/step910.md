## 🧩 STEP 10 — MCP Gateway (Tool Registry + Invocations + Policy + Audit + Adapters)

This step is where your platform becomes *action-capable* — safely.

> **Agents/LLM never call external systems directly.**
> All actions happen via **MCP tools** governed by **policy + audit + workflow**.

---

### Purpose of Step 10

Build `mcp-gateway` (TS) that provides:

* a **Tool Registry** (schemas, scopes, sensitivity, allowed purposes)
* a **Tool Invocation Runtime**:

  * `Authorize → Validate → Execute → Audit`
* adapters to execute tools:

  * generic REST adapter (MVP)
  * SOAP adapter stub (similar to Step 7)
* hooks for workflow approval requirements

---

### 🔒 Preconditions

* Step 3 audit ledger works
* Step 4 policy-service works
* Step 6 governed-http middleware exists
* Step 9 llm-gateway exists (not required to integrate yet, but good)

---

### ✅ Deliverables at End of Step 10

* Tool registry persisted in Postgres
* Tool invocation API works end-to-end for at least **one REST tool**
* Authorization enforced for every tool invocation
* Input/output schema validation enforced
* Audit events include:

  * TOOL_INVOKE_START, TOOL_INVOKE_RESULT, TOOL_INVOKE_FAILED
* Optional: tool generator from OpenAPI spec (nice-to-have)

---

# 📁 PROMPT PACK — STEP 10 (COPY–PASTE INTO AGENTIC IDE)

## PROMPT 10.1 — Define Tool & ToolInvocation Schemas (if not already final)

```
Review existing Tool.json and ToolInvocation.json.

Ensure Tool includes:
- tool_id (uuid)
- tenant_id
- name
- description
- adapter_type: rest|soap|custom
- input_schema (json schema)
- output_schema (json schema)
- sensitivity: low|medium|high
- allowed_purposes: string[]
- labels: { system, domain, department_id, jurisdiction }
- config: { base_url, auth_type, headers?, soap_wsdl_url?, operation? }  // secrets not stored here
- created_at, updated_at

Ensure ToolInvocation includes:
- invocation_id
- tool_id
- tenant_id
- actor
- purpose
- input (json)
- output (json nullable)
- status: started|success|failed|denied
- started_at, completed_at
- error_code, error_message (no secrets)

Update schemas if needed. Output file contents only.
```

## PROMPT 10.2 — Create Postgres Schema + Migrations for Tool Registry

```
Create SQL migrations for:

Tables:
1) tools
- tool_id uuid pk
- tenant_id
- name
- description
- adapter_type
- sensitivity
- allowed_purposes jsonb
- labels jsonb
- input_schema jsonb
- output_schema jsonb
- config jsonb (NO secrets)
- enabled boolean default true
- created_at, updated_at

2) tool_invocations (optional if you rely only on audit; but useful)
- invocation_id uuid pk
- tool_id
- tenant_id
- actor jsonb
- purpose
- input jsonb (redacted if needed)
- output jsonb (redacted if needed)
- status
- started_at, completed_at

Indexes:
- (tenant_id, tool_id)
- (tenant_id, name)
- (tenant_id, status)

Output:
- migration files
- README explaining secret handling policy
```

## PROMPT 10.3 — Implement mcp-gateway Skeleton (governedRoute)

```
Implement mcp-gateway in TypeScript using governedRoute.

Endpoints:
1) POST /tools
- action: tool.create (privileged=true)
2) GET /tools
- action: tool.list (privileged=true)
3) GET /tools/{tool_id}
- action: tool.read (privileged=true)
4) POST /tools/{tool_id}/invoke
- action: tool.invoke (privileged=true)

Rules:
- validate requests with schemas
- persist tools to Postgres
- tool.invoke must:
  - fetch tool definition
  - check purpose is allowed for tool
  - call policy-service authorize with resource containing tool labels + sensitivity
  - validate input against tool.input_schema (Ajv)
  - execute using adapter
  - validate output against tool.output_schema
  - emit audit events

Output:
- service code + Dockerfile
- example curl flows
```

## PROMPT 10.4 — Implement Adapter Abstraction + REST Adapter MVP

```
Create adapter interface:

interface ToolAdapter {
  invoke(tool, input, context): Promise<{ output }>
}

Implement RestAdapter:
- supports:
  - method, path, query, headers templates
  - auth types: none|api_key|bearer (no secrets in DB; use env or vault later)
- executes request using fetch/axios
- rate limiting and timeout
- retries only on safe errors (idempotency-aware)

Output:
- adapters/RestAdapter.ts
- adapter registry
- config docs
```

## PROMPT 10.5 — Schema Validation + Redaction Rules

```
Enforce schema validation for tool invoke:

- validate input JSON with Ajv using tool.input_schema
- after adapter call, validate output with tool.output_schema
- if validation fails, return 422

Add redaction hooks:
- For sensitivity=high:
  - do not store full input/output in tool_invocations table
  - store hashes or redacted subsets
- Always store full details in audit? No — follow Step 3 guidance:
  - audit stores IDs + hashes, not full sensitive payload

Output:
- validation module
- redaction module
- documentation
```

## PROMPT 10.6 — Policy Integration for Tool Invoke (Hardening)

```
Implement strict policy enforcement for tool invoke:

Authorize request must include:
- action: "tool.invoke"
- resource:
  - type: "tool"
  - id: tool_id
  - labels: tool.labels
  - sensitivity: tool.sensitivity
- purpose: from X-Purpose
- context includes:
  - tool_name
  - workflow_id (optional)
  - agent_invocation_id (optional)

Rules:
- deny if purpose not in tool.allowed_purposes
- fail closed if policy-service unavailable
- audit:
  - TOOL_INVOKE_START
  - TOOL_INVOKE_RESULT or TOOL_INVOKE_FAILED
  - include invocation_id + tool_id + decision_id

Output:
- code changes + example authorize payloads
```

## PROMPT 10.7 — OpenAPI → Tool Generator (Optional but Very Useful)

```
Implement an endpoint:
- POST /tools/generate/openapi

Input:
- openapi_url OR openapi_json
- naming prefix
- tool labels (system/domain)

Behavior:
- parse OpenAPI spec
- generate Tool definitions for selected operations:
  - input_schema from request body schema
  - output_schema from response schema
  - config method/path
- store tools disabled by default (requires admin enable)

Output:
- generator module
- endpoint implementation
- example using a sample OpenAPI
```

## PROMPT 10.8 — SOAP Adapter Stub (Same pattern as Step 7)

```
Add a SOAP adapter stub:

- allow registering tools with adapter_type='soap'
- invoke endpoint:
  - creates a job entry (pending)
  - does not execute SOAP yet
  - audit SOAP_TOOL_INVOKE_REQUESTED

Output:
- job schema (if needed)
- stub implementation
- README describing next step to implement real SOAP execution
```

## PROMPT 10.9 — Tests (Non-negotiable)

```
Add tests for mcp-gateway:

1) tool.create requires auth + audit
2) tool.invoke validates input schema and rejects invalid input
3) tool.invoke fails closed if policy-service is down
4) tool.invoke executes REST adapter and validates output schema
5) sensitive tool redaction applied
6) audit events emitted in correct order

Output:
- test suite
- run instructions
```

---

# ✅ Step 10 Acceptance Checklist

Move on only if:

* [ ] Tools can be created/listed/read in Postgres
* [ ] Tool invoke enforces:

  * purpose allowlist
  * policy authorize
  * input/output schema validation
* [ ] REST adapter works with one sample tool end-to-end
* [ ] Sensitive tool redaction works
* [ ] Audit events exist for invoke start/result/fail
* [ ] Fail-closed behavior works if policy/audit is down
* [ ] Tests cover key paths

 