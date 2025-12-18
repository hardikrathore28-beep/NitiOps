

# 🧩 STEP 3 — Audit Engine (Persistent, Immutable, Forensic-Grade)

## Purpose of Step 3

Turn the **stub audit service** from Step 2 into a **production-grade, append-only audit ledger** that supports:

* forensic replay
* legal defensibility
* agent + workflow traceability
* zero silent failures

> **Nothing else in the platform is trusted unless it writes to Audit.**

---

## 🔒 Preconditions (Hard Gate)

You must already have:

* Step 1 finalized (contract + schemas)
* Step 2 completed (repo + infra + stub audit service)
* `AuditEvent` schema locked and versioned

If not → **STOP**

---

## ✅ Deliverables at End of Step 3

* Persistent audit storage (Postgres)
* Append-only enforcement (no updates/deletes)
* Hash-chained audit events
* Audit query API
* Audit verification utility
* Every service can write auditable events

---

# 📁 PROMPT PACK — STEP 3 (COPY–PASTE INTO AGENTIC IDE)

---

## PROMPT 3.1 — Design Audit Storage Schema (Append-Only)

```
You are a senior backend architect.

Design a PostgreSQL schema for an immutable audit ledger.

Requirements:
- Table: audit_events
- Append-only (no UPDATE, no DELETE)
- Columns must include:
  - event_id (UUID, PK)
  - tenant_id
  - timestamp
  - event_type
  - actor (JSONB)
  - purpose
  - context (JSONB)
  - references (JSONB)
  - payload_hash
  - hash_prev
  - hash_this
- Indexes for:
  - tenant_id
  - event_type
  - timestamp
  - references->workflow_id
  - references->agent_invocation_id

Rules:
- hash_this = hash(payload + hash_prev)
- payload_hash excludes hash fields

Output:
- SQL migration file
- README explaining immutability guarantees
```

---

## PROMPT 3.2 — Enforce Immutability at DB Level

```
Extend the audit schema to prevent mutation.

Requirements:
- Database-level protection:
  - Revoke UPDATE and DELETE privileges
  - Optional trigger to block mutation attempts
- Only INSERT allowed for application role
- Read-only role for auditors

Output:
- SQL migration
- Example GRANT statements
- Short explanation of threat model
```

---

## PROMPT 3.3 — Upgrade Audit Service to Persistent Storage

```
Upgrade audit-service to persist events in Postgres.

Requirements:
- Replace in-memory storage with database writes
- Validate incoming payload against AuditEvent schema
- Compute hash_prev and hash_this
- Reject events if hash chain is broken
- Write exactly one row per event

Endpoints:
- POST /audit/events
- GET /audit/events (filtered by tenant, event_type, time)

Rules:
- No bulk inserts
- No retries that duplicate events
- All failures must be logged

Output:
- Updated audit-service code
- DB integration code
- Error handling strategy
```

---

## PROMPT 3.4 — Add Audit Verification Utility

```
Create a verification utility that checks audit integrity.

Requirements:
- Verify hash chain consistency
- Detect missing or reordered events
- Output report:
  - valid / invalid
  - first broken event_id (if any)
- CLI command:
  - verify_audit --tenant <id>

Place under:
/shared/tools/audit_verify/

Output:
- Source code
- README with usage
```

---

## PROMPT 3.5 — Add Agent & Workflow Awareness to Audit

```
Extend audit handling to support agent and workflow tracing.

Requirements:
- Support event types:
  - AGENT_INVOKE_START
  - AGENT_INVOKE_END
  - WORKFLOW_STARTED
  - WORKFLOW_STEP
  - WORKFLOW_COMPLETED
- Enforce:
  - agent_invocation_id required for agent events
  - workflow_id required for workflow events
- Reject malformed audit events

Output:
- Updated validation logic
- Example valid audit events
```

---

## PROMPT 3.6 — Minimal Audit Query API for Reviewers

```
Add read-only query support for auditors.

Endpoint:
- GET /audit/search

Filters:
- tenant_id (required)
- workflow_id
- agent_invocation_id
- event_type
- time range

Rules:
- Read-only access
- No pagination hacks
- Results ordered by timestamp

Output:
- Endpoint implementation
- Example curl queries
```

---

## PROMPT 3.7 — Wire Audit Middleware into Base Template

```
Update the shared service template so that:

- Every request automatically emits:
  - REQUEST_RECEIVED
  - AUTHZ_DECISION
  - REQUEST_COMPLETED or REQUEST_FAILED
- Audit write failures:
  - block request if audit is mandatory
  - fail closed for privileged actions

Output:
- Updated base template code
- README explaining how services inherit audit behavior
```

---

# ✅ STEP 3 — ACCEPTANCE CHECKLIST

Before moving to Step 4, verify:

* [ ] Audit events persist across restarts
* [ ] No UPDATE/DELETE possible on audit_events table
* [ ] Hash chain verification passes
* [ ] Tampering is detectable
* [ ] Agent + workflow events are traceable end-to-end
* [ ] Every service writes audit automatically

If **any item fails → do not proceed**

---

## 🚫 What NOT to Do in Step 3

* Do NOT add business logic
* Do NOT add workflows yet
* Do NOT relax audit requirements “for convenience”
* Do NOT batch audit events

---

## 🧠 Mental Model (Lock This In)

> **If it isn’t in Audit, it didn’t happen.**

