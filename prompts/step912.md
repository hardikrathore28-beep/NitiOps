## 🧩 STEP 12 — Applications + Onboarding Packs (Make it Reusable for Any Org/Department)

This is the **productization step**: turn all the platform services into something people can actually use and onboard repeatedly.

> After Step 12, you can onboard a new enterprise or govt dept by configuration + a few connectors — not rewriting code.

---

# 🎯 Purpose of Step 12

1. Build minimal **internal admin console** + **citizen/customer portal** surfaces
2. Provide **Onboarding Packs**:

   * Policy Pack
   * Tool Pack
   * Workflow Pack
   * Knowledge Pack
3. Provide a **repeatable onboarding playbook**:

   * “create tenant → seed realm → add tools → attach workflow → ingest sources”
4. Provide minimal observability dashboards & runbooks

---

## 🔒 Preconditions

* Workflows + approvals working (Step 11)
* MCP tools working (Step 10)
* LLM gateway working (Step 9)
* RAG retrieval working (Step 8)
* Ingestion working (Step 7)
* Auth/policy/audit stable (Steps 3–6)

---

# ✅ Deliverables at End of Step 12

* `admin-console` (web) for internal users:

  * tenant management (create tenant / realm)
  * user management (create user in tenant realm)
  * tool registry management
  * workflow runs viewer + start workflow
  * approvals inbox (if not already)
  * audit search / trace view
* `citizen-portal` (web) MVP:

  * submit request/grievance
  * check status
  * receive response
* Onboarding Pack format + loader:

  * one folder per tenant
  * versioned configs
* “New Department Onboarding” checklist + scripts

---

# 📁 PROMPT PACK — STEP 12 (COPY–PASTE INTO AGENTIC IDE)

## PROMPT 12.1 — Define Onboarding Pack Format (Versioned)

```
Create a standard onboarding pack format under /packs/<tenant_id>/.

Each pack must include:
- pack.yaml (pack metadata + version)
- policy/
  - rego overrides or data.json used by policies
- tools/
  - tools.json (list of tool definitions)
- workflows/
  - workflow_config.json (approval matrix, SLA, routing)
- knowledge/
  - sources.json (ingestion sources config)
  - chunking_rules.json (optional)

Also create:
- /packs/README.md explaining how packs are applied
- A schema for pack.yaml under /shared/schemas/OnboardingPack.json

Output:
- folder structure
- schema
- sample pack for tenant 'demo'
```

## PROMPT 12.2 — Implement Pack Loader CLI

```
Create a CLI tool: /shared/tools/pack_apply/

Command:
- pack_apply --tenant demo --path ./packs/demo

Behavior:
- validates pack against schema
- applies policy data/config (copies to /policy/data/ or updates bundles strategy)
- registers tools via mcp-gateway API
- configures workflow defaults via workflow-service API
- configures ingestion sources (stores config for ingestion-service)

Must be idempotent (re-run safe).

Output:
- CLI code
- README with commands
- example output
```

## PROMPT 12.3 — Admin Console MVP (Next.js or React)

```
Build admin-console web app with pages:

1) Login (Keycloak OIDC)
2) Tenants
   - create tenant (calls tenant-service)
   - list tenants
3) Users
   - create user in tenant realm (tenant-service)
   - assign roles
4) Tools
   - list/register tools (mcp-gateway)
   - invoke tool (dev-only page)
5) Workflows
   - start workflow (workflow-service)
   - view workflow status
6) Approvals
   - list pending approvals
   - approve/reject
7) Audit
   - search by workflow_id / actor / time range
   - view trace timeline

Rules:
- every call includes X-Purpose
- show decision_id and audit references where available
- no secrets displayed

Output:
- app code structure + key components
- env config
- run instructions
```

## PROMPT 12.4 — Citizen/Customer Portal MVP

```
Build citizen-portal web app with:

Pages:
1) Submit Request
   - creates a case/request record (can be in workflow-service or a simple case-service)
   - triggers workflow.start
2) Track Status
   - shows workflow status timeline
3) View Response
   - shows final drafted/approved response

Rules:
- keep it minimal, no fancy UI
- all backend calls are governed (purpose required)
- do not expose internal audit details to citizen

Output:
- app code + run instructions
```

## PROMPT 12.5 — Case/Request Minimal Service (If Needed)

```
If you don’t already have a case record, create a minimal case-service:

Endpoints:
- POST /cases
- GET /cases/{case_id}

Stores:
- case_id, tenant_id, created_by, channel, status, workflow_id, summary

This is optional but usually needed for citizen tracking.

All endpoints use governedRoute.

Output:
- service code + migrations + dockerfile
```

## PROMPT 12.6 — “Onboarding Playbook” Documentation

```
Create /docs/ONBOARDING_PLAYBOOK.md.

Include:
1) Create tenant (realm-per-tenant)
2) Apply onboarding pack
3) Seed users
4) Configure tools
5) Configure workflow approval matrix
6) Configure ingestion sources
7) Smoke test checklist:
   - ingest → index → chat → approval → tool invoke → notify → audit trace

Make it actionable, step-by-step.

Output file content only.
```

## PROMPT 12.7 — Smoke Test Script (One Command)

```
Create /scripts/smoke_test_demo.sh that performs:

- creates demo tenant (if missing)
- applies demo pack
- uploads a sample doc
- processes ingestion
- indexes document
- performs rag search
- calls llm chat in rag mode
- starts a workflow that requires approval
- approves it
- verifies tool invocation happened
- fetches audit trace for workflow_id

Output:
- script + README
- expected outputs
```

## PROMPT 12.8 — Minimal Observability Dashboard (MVP)

```
Add a minimal observability page or script that shows:

- last 20 workflows and their status
- last 20 tool invocations
- last 20 policy denies
- error rate and latency basics (can be from logs initially)

No full monitoring stack required yet.

Output:
- implementation choice + code
- docs
```

---

# ✅ Step 12 Acceptance Checklist

You’re “platform-complete” when:

* [ ] Admin console can onboard tenant + users
* [ ] Pack loader registers tools + workflow config idempotently
* [ ] Citizen portal can submit request + track status + view response
* [ ] Smoke test script runs end-to-end successfully
* [ ] Audit trace exists for the full journey
* [ ] New tenant onboarding is mostly configuration (packs), not code

---

## What you have after Step 12

A real **AI enablement platform** you can deploy for:

* enterprises (ITSM/CRM)
* government departments (citizen services)
* high-security orgs (NASA/FBI-style constraints)

…and onboard them repeatedly using packs.

 