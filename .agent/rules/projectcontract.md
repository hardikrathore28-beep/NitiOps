---
trigger: always_on
---

You are a senior solution architect.
Create a file named PROJECT_CONTRACT.md at repo root for a Governed AI Enablement Platform.

REQUIRED SECTIONS

1. Platform Philosophy

Policy-first (deny by default)

Workflow-first (deterministic execution)

Audit-by-default (forensic traceability)

Tool-only execution (no direct system access)

Human authority over AI autonomy

2. Agent Model (Non-Negotiable)

Hierarchical agent structure

One root orchestrator (Workflow Agent)

Specialist agents invoked explicitly as AgentTools

Sequential execution is default

Parallel agents allowed only for independent, read-only tasks

Loop agents allowed only with bounded iterations

No free-roaming or self-delegating agents

3. Canonical Domain Models
List and briefly define:
Tenant, Department, User, Role, Document, Chunk, Tool, ToolInvocation, WorkflowRun, Approval, AuditEvent, AgentInvocation

4. Hard Platform Rules (Must / Must Not)

Every agent invocation MUST be explicit and auditable

Every API, retrieval, tool call MUST call Authorize(actor, action, resource, purpose, context)

LLMs MUST NOT directly invoke tools or other agents

Agents MUST NOT bypass workflows

Retrieval MUST be authorized at chunk level

Privileged actions MUST require human approval

5. Definition of Done — Step 1

Contract finalized

Schemas defined

Validation scripts pass

6. Instructions for Future Code Generation

Do not invent endpoints

Do not invent agents

Follow schemas and agent rules strictly

Keep the document concise, precise, and enforceable.
Output only the file content.