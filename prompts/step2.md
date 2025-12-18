# STEP 2 — Repo & Local Infrastructure Bootstrap

> **Purpose of Step 2**  
Create a repeatable, Apple-Silicon-friendly local development environment with **one-command startup**, aligned with the **Hierarchical + Workflow + AgentTool** philosophy locked in Step 1.

---

## 🔒 Preconditions (Must be true before starting)
- `PROJECTCONTRACT.md` exists and is reviewed from .agents/rules
- Canonical schemas exist under `/shared/schemas`
- Agent rules are finalized (no free-roaming agents)

If any of the above is missing → **STOP**

---

## ✅ Deliverables at End of Step 2
- Mono-repo created
- Docker Compose boots core infrastructure
- One dummy service runs and can:
  - authenticate via Keycloak
  - call Policy Service (stub)
  - write Audit Event (stub)

> **No business logic yet. Infrastructure only.**

---

# 📁 PROMPT PACK (COPY–PASTE INTO AGENTIC IDE)

---

## PROMPT 2.1 — Create Repository Structure

You are a senior platform engineer.

Create a mono-repo directory structure for a Governed AI Enablement Platform.

Requirements:
- Follow the agent-first, workflow-first philosophy defined in PROJECT_CONTRACT.md
- Do NOT add business logic
- Do NOT invent APIs beyond placeholders

Directory structure:
/
  /infra
    docker-compose.yml
    .env.example
  /services
    audit-service/
    policy-service/
    tenant-service/
    ingestion-service/
    rag-service/
    llm-gateway/
    mcp-gateway/
    workflow-service/
  /apps
    admin-console/
    citizen-portal/
  /shared
    /schemas
    /constants
    /sdk
    /tools

Add README.md files in:
- repo root
- /services
- /apps
- /infra

Each README should explain purpose, not implementation.

---

## PROMPT 2.2 — Docker Compose (Core Infrastructure Only)

Create docker-compose.yml under /infra.

Must include Apple Silicon compatible images for:
- PostgreSQL
- Keycloak
- Open Policy Agent (OPA)
- Temporal Server
- Temporal UI

Rules:
- No application services yet
- Use named volumes
- Expose minimal ports
- Add healthchecks
- Use environment variables only

Also create .env.example listing all required variables.

---

## PROMPT 2.3 — Base Service Template (Shared Pattern)

Create a minimal service template to be reused by all backend services.

Language: use the backend language selected in Step 1.

Template must include:
- HTTP server with /health endpoint
- JWT validation middleware
- Placeholder for policy check
- Placeholder for audit write
- Structured logging

Do NOT implement actual policy or audit logic yet.

Place this under:
/shared/sdk/service-template/

---

## PROMPT 2.4 — Stub Audit Service

Create audit-service using the base service template.

Endpoints:
- POST /audit/events
- GET /audit/events

Rules:
- Validate payload against AuditEvent schema
- Store in memory only
- Log every request

Add Dockerfile.

---

## PROMPT 2.5 — Stub Policy Service

Create policy-service using the base service template.

Endpoints:
- POST /authorize

Behavior:
- Always return allow=true
- Log request payload

No OPA integration yet.

---

## PROMPT 2.6 — Wire Services into Docker Compose

Update docker-compose.yml to add:
- audit-service
- policy-service

Rules:
- depends_on Postgres, Keycloak, OPA
- Internal networking only

---

## PROMPT 2.7 — One-Command Startup

Add Makefile with:
- make up
- make down
- make logs
- make health

Optional scripts/healthcheck.sh.

---

# ✅ STEP 2 — ACCEPTANCE CHECKLIST

- make up starts all services
- /health endpoints respond
- Can POST and GET audit events
- /authorize responds
- No business logic implemented

---

 
