## 🧩 STEP 6 — Guarded API Pattern (TypeScript): Auth + Purpose + Policy + Audit as Middleware

This step makes every service endpoint automatically follow your contract:

> **JWT (realm-per-tenant) → Purpose → Authorize() → Audit → Handler**

So devs can’t “forget” governance.

---

### Purpose of Step 6

* Create a **shared TS middleware package** used by every service
* Standardize how endpoints declare:

  * `action` (e.g., `document.ingest`, `rag.search`, `tool.invoke`)
  * `resource` (type/id/labels)
  * `purpose` (from `X-Purpose`)
* Enforce:

  * **fail-closed** for privileged routes
  * **audit coverage** for request start/stop + auth decisions
* Provide an example service endpoint using the pattern end-to-end

---

### 🔒 Preconditions

* Step 3: persistent audit ledger works
* Step 4: `/authorize` returns deterministic allow/deny
* Step 5: JWT validation works for realm-per-tenant tokens (multi-issuer)

---

### ✅ Deliverables at End of Step 6

* `/shared/sdk/governed-http/` package (middleware + helpers)
* Purpose enforcement (`X-Purpose` required for governed routes)
* Route action mapping (declarative)
* Standard resource builder patterns
* “Fail closed” behaviour for privileged actions
* At least **one endpoint** in one service using it fully

---

# 📁 PROMPT PACK — STEP 6 (COPY–PASTE INTO AGENTIC IDE)

## PROMPT 6.1 — Create a Shared “Governed HTTP” SDK Package

```
Create a TypeScript package at /shared/sdk/governed-http/ that provides:

Exports:
- requireAuth()            // validates JWT, attaches actor + tenant_id to req
- requirePurpose()         // enforces X-Purpose header for governed calls
- authorize(action, resourceResolver, options)  // calls policy-service /authorize
- auditRequest()           // writes REQUEST_RECEIVED/COMPLETED/FAILED to audit-service
- governedRoute(config, handler) // combines all above in correct order

Config must support:
- action: string
- resourceResolver(req): { type, id?, labels?, jurisdiction?, sensitivity?, owner_department_id? }
- privileged: boolean (if true: fail closed if audit or policy unavailable)
- purposeRequired: boolean
- redactRequestBody: boolean (default true for privileged)

Also include:
- types for Actor, Purpose, Resource, Obligations, Decision

Output full file tree and file contents.
```

## PROMPT 6.2 — Implement the Correct Execution Order (Critical)

```
Implement governedRoute() so the pipeline order is exactly:

1) requireAuth()  -> actor, tenant_id
2) requirePurpose() -> purpose (X-Purpose)
3) auditRequest(REQUEST_RECEIVED)  [minimal metadata only]
4) authorize() -> policy decision (allow/deny + obligations)
5) auditRequest(AUTHZ_DECISION)
6) if deny -> return 403 with decision_id, audit REQUEST_COMPLETED
7) call handler with context (actor, purpose, obligations)
8) auditRequest(REQUEST_COMPLETED or REQUEST_FAILED)

Rules:
- privileged route must fail closed if:
  - policy-service is unreachable
  - audit-service is unreachable
- non-privileged route may degrade ONLY if explicitly configured

Output only the governedRoute implementation + tests.
```

## PROMPT 6.3 — Add a Declarative Action Mapping Pattern

```
Add a route configuration pattern that prevents devs from inventing actions ad hoc.

Requirements:
- Central file /shared/constants/actions.ts already exists
- Create helper:
  - actionFrom(actions.<name>)
- Each service should have routes declared like:

router.post("/tenants", governedRoute({
  action: actions.tenant.create,
  privileged: true,
  purposeRequired: true,
  resourceResolver: ...
}, handler))

Output example router file template and docs.
```

## PROMPT 6.4 — Integrate with Audit Service (Step 3)

```
Implement the audit client inside governed-http.

Requirements:
- POST audit events to audit-service
- Use AuditEvent schema fields:
  - tenant_id, actor, purpose, context, references
- Include a request_id correlation ID
- Ensure request bodies are NOT logged for privileged routes
- Hashing is handled by audit-service; client should not attempt to compute hash

Output:
- auditClient.ts
- config options via env vars
- example emitted audit events
```

## PROMPT 6.5 — Integrate with Policy Service (Step 4)

```
Implement the policy client inside governed-http.

Requirements:
- POST to policy-service /authorize
- Validate response shape (AuthorizeResponse)
- Attach obligations + decision_id to req context

Fail-closed behavior:
- privileged=true -> return 503 (policy unavailable) + audit failure event
- privileged=false -> configurable fallback deny or allow (default deny)

Output:
- policyClient.ts
- error handling behavior documented
```

## PROMPT 6.6 — Provide a Minimal End-to-End Example in tenant-service

```
Update tenant-service to use governedRoute for one endpoint, e.g.:

POST /tenants

Requirements:
- Must enforce:
  - JWT validation
  - X-Purpose required
  - policy authorize action tenant.create
  - audit events emitted

Resource resolver:
- resource.type = "tenant"
- resource.id = "<new tenant slug>" if present, else "unknown"
- labels: { operation: "create" }

Handler:
- can be a stub returning { ok: true } if Step 5 provisioning is not complete yet
- but must demonstrate complete governance flow

Output:
- updated route code
- curl example showing required headers and token
- expected audit event types sequence
```

## PROMPT 6.7 — Add Tests (Non-negotiable)

```
Add unit tests for governed-http:

Test cases:
1) Missing JWT -> 401
2) Missing X-Purpose -> 400
3) Policy denies -> 403 + decision_id
4) Policy allows -> handler executes + 200
5) Privileged route + policy down -> 503 (fail closed)
6) Privileged route + audit down -> 503 (fail closed)

Use a test runner appropriate for TS project (jest or vitest).
Mock policy-service and audit-service.

Output:
- test files
- how to run: make test or npm test
```

---

# ✅ Step 6 Acceptance Checklist

You can move on only if:

* [ ] All governed routes require valid JWT (realm-per-tenant)
* [ ] X-Purpose is enforced for governed calls
* [ ] Every request produces audit events in correct order
* [ ] Policy deny returns 403 with decision_id
* [ ] Privileged routes fail closed when policy/audit is down
* [ ] At least one endpoint (POST /tenants) uses governedRoute end-to-end
* [ ] Tests cover the 6 core cases

---

## Next Step

**STEP 7 — Ingestion Layer (Docs + OCR + Audio + REST/SOAP adapters)**

If you want, I can tailor Step 7 to your immediate target (gov grievance vs enterprise ITSM) so the ingestion sources match a real onboarding scenario.
