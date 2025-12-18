

# 🧩 STEP 4 — Policy Engine (OPA + Authorize Everywhere)

## Purpose of Step 4

Build a production-grade **Policy Decision Point (PDP)** that enforces:

* **deny-by-default**
* **ABAC + purpose-of-use**
* **resource-level + chunk-level retrieval control**
* **tool invocation control**
* **workflow/agent invocation control**
* every decision is **audited** (Step 3)

> **Security posture:** fail closed for privileged operations.

---

## 🔒 Preconditions (Hard Gate)

You must have:

* Step 3 audit ledger working (persistent + immutable)
* Step 2 infra up (OPA running in docker-compose)
* `PROJECT_CONTRACT.md` rules accepted (no bypassing)

If not → **STOP**

---

## ✅ Deliverables at End of Step 4

* Real `policy-service` with OPA integration
* Canonical `Authorize()` API and decision payload
* Initial policy packs (Rego) for:

  * API access
  * RAG chunk retrieval
  * MCP tool invocation
  * Agent invocation (AgentTool only)
  * Workflow lifecycle actions
* Policy test harness + fixtures
* Integration into base service template (middleware)
* Every auth decision logged to audit

---

# 📁 PROMPT PACK — STEP 4 (COPY–PASTE INTO AGENTIC IDE)

---

## PROMPT 4.1 — Define the Authorization Request/Response Contract

```
You are a security architect.

Define the canonical Authorize API contract.

Create:
- /shared/schemas/AuthorizeRequest.json
- /shared/schemas/AuthorizeResponse.json

AuthorizeRequest required fields:
- tenant_id
- actor: { actor_id, actor_type, roles[], department_id }
- action: string (e.g., "document.read", "rag.search", "tool.invoke", "agent.invoke", "workflow.start", "approval.decide")
- resource: { type, id, labels?, owner_department_id?, jurisdiction?, sensitivity? }  // allow type-specific extensions
- purpose: string
- context: { ip?, channel?, time?, justification?, case_id?, workflow_id?, agent_invocation_id? }

AuthorizeResponse:
- allow: boolean
- decision_id: uuid
- reasons: string[]
- obligations: { redactions?, approval_required?, max_rows?, field_mask? } // optional
- policy_version: string

Output file contents only.
```

---

## PROMPT 4.2 — Implement Policy Pack Repo Structure (Rego)

```
Create /policy/ directory with a clear structure for Rego policies and tests.

Must include:
- /policy/README.md
- /policy/bundles/base.rego              (deny by default, helpers)
- /policy/bundles/api_access.rego        (API endpoint permissions)
- /policy/bundles/rag_access.rego        (chunk retrieval rules)
- /policy/bundles/tool_access.rego       (MCP tool invocation rules)
- /policy/bundles/agent_access.rego      (AgentTool invocation rules)
- /policy/bundles/workflow_access.rego   (workflow lifecycle permissions)
- /policy/tests/*.rego                   (unit tests)

Rules:
- Default deny everywhere
- Allow only via explicit rules
- Use actor.roles, tenant_id, purpose, resource.labels/jurisdiction/sensitivity

Output the tree and contents of all files.
```

---

## PROMPT 4.3 — Implement Policy Service with OPA Integration

```
Upgrade policy-service to call OPA for decisions.

Requirements:
- Endpoint: POST /authorize
- Validate request against AuthorizeRequest schema
- Call OPA with input = AuthorizeRequest (or mapped input)
- Return AuthorizeResponse with decision_id and policy_version
- Deny by default on any error (OPA unavailable, invalid request, timeout)
- Add timeouts and circuit breaker behavior

Also:
- Write audit events:
  - AUTHZ_CHECK (request metadata)
  - AUTHZ_DECISION (allow/deny, reasons, obligations, policy_version)

Output:
- Updated policy-service code
- OPA query path and bundle loading strategy
- Any docker-compose updates needed
```

---

## PROMPT 4.4 — Load Policy Bundles into OPA (Local Dev)

```
Implement local dev loading of Rego policies into OPA.

Options:
- OPA bundle server served by policy-service, OR
- Mount /policy into OPA container and configure OPA to load it

Requirements:
- Hot-reload for local dev is preferred
- Document how to update policies and see effect quickly

Output:
- docker-compose.yml changes
- OPA config file if needed
- README steps
```

---

## PROMPT 4.5 — Create Policy Test Harness (Must Run in CI)

```
Create a policy test harness runnable locally and in CI.

Requirements:
- Run OPA tests for /policy/tests/*.rego
- Provide sample fixtures:
  - admin allowed everything
  - officer allowed only within department + purpose
  - auditor read-only access
  - tool invocation denied without scope
  - agent.invoke denied unless invoked as AgentTool and within workflow context
- Provide a Makefile target: make policy-test

Output:
- scripts and config needed
- sample fixtures
- updated Makefile
```

---

## PROMPT 4.6 — Wire Authorize into Base Service Template

```
Update /shared/sdk/service-template/ so that every request can enforce authorization.

Requirements:
- Middleware extracts:
  - tenant_id
  - actor roles from JWT
  - action mapping per route (configurable)
  - purpose from request header or body
  - resource from route params/body
- Calls policy-service /authorize
- On deny: return 403 and write audit event
- On allow: attach obligations to request context for downstream use

Also:
- Provide route-to-action mapping pattern:
  - config file or decorator annotation
- Provide one example endpoint showing correct usage

Output updated code + README.
```

---

## PROMPT 4.7 — Retrieval-Time Authorization Hook (RAG Contract)

```
Define how retrieval-time authorization will be enforced.

Create a short spec:
- rag-service must request authorization for each candidate chunk or use a batch policy call
- chunk labels passed as resource.labels
- response returns only allowed chunk_ids
- obligations may apply field masking/redactions

Output:
- /shared/ARCH_RETRIEVAL_AUTH.md
- example authorize payloads for chunk access
```

---

## PROMPT 4.8 — Tool Invocation Authorization Hook (MCP Contract)

```
Define how tool invocation authorization is enforced.

Create a short spec:
- mcp-gateway calls /authorize before executing any tool
- tool scope, purpose, sensitivity included in resource
- obligations may enforce approval_required
- tool calls must fail closed if policy-service unavailable

Output:
- /shared/ARCH_TOOL_AUTH.md
- example authorize payloads for tool.invoke
```

---

# ✅ STEP 4 — ACCEPTANCE CHECKLIST

Before moving to Step 5, verify:

* [ ] `/authorize` calls OPA and returns allow/deny deterministically
* [ ] Deny-by-default holds for unknown actions/resources
* [ ] If OPA/policy-service is down → privileged ops fail closed
* [ ] Authz decisions are written to the immutable audit ledger
* [ ] `make policy-test` runs all policy unit tests
* [ ] Base service template enforces Authorize on at least one endpoint
* [ ] Policies include explicit constraints for:

  * rag.search / chunk access
  * tool.invoke
  * agent.invoke (AgentTool-only, workflow-context required)
  * workflow.start/step/complete
  * approval.decide

---

## 🚫 What NOT to Do in Step 4

* Don’t embed access rules inside services (only call Authorize)
* Don’t allow “temporary bypass for dev”
* Don’t let LLM decide permissions
* Don’t let agents self-delegate (must be explicit invocation only)

---

## 🧠 “Policy Model” you should keep

**Allow = f(actor, action, resource, purpose, context)**
Everything else is an implementation detail.

 