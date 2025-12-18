

# ✅ STEP 1 (REVISED) — Platform Contract with Controlled Agent Philosophy

## Goal of Step 1 (Revised)

Lock the **agent model**, **execution boundaries**, and **governance guarantees** so that:

* agents behave like **software components**
* workflows remain **deterministic**
* every agent action is **authorized, auditable, and replayable**

---

## 🔐 Core Agent Philosophy (must be embedded everywhere)

* **Hierarchical orchestration**

  * One root orchestrator (workflow agent)
  * Specialist agents operate only when invoked

* **Workflow-first**

  * Sequential execution by default
  * Parallel execution only for safe, read-only tasks
  * Looping only with bounded retries

* **Explicit invocation only**

  * Agents are callable like tools (AgentTool pattern)
  * No agent may autonomously call another agent
  * No agent may call external systems directly

* **Human authority over autonomy**

  * Privileged actions require approval
  * Agents can draft, suggest, prepare — not decide

---
 

## Prompt 2 — Create JSON Schemas (with Agent semantics)

> Create directory `/shared/schemas/` and add JSON Schema files (draft 2020-12) for:
>
> * Tenant.json
> * Department.json
> * User.json
> * Role.json
> * Document.json
> * Chunk.json
> * Tool.json
> * ToolInvocation.json
> * **AgentInvocation.json**
> * WorkflowRun.json
> * Approval.json
> * AuditEvent.json
>
> ### Special requirements
>
> **AgentInvocation schema MUST include:**
>
> * agent_id
> * agent_type (orchestrator | specialist)
> * invoked_by (workflow_id or tool_id)
> * input_refs (IDs only, no raw sensitive data)
> * output_refs
> * execution_mode (sequential | parallel | loop)
> * iteration_index (nullable)
>
> **AuditEvent schema MUST include:**
>
> * event_type enum including:
>   AGENT_INVOKE_START, AGENT_INVOKE_END
> * references to agent_invocation_id
>
> Also create `/shared/schemas/README.md` explaining each schema and how agents fit into the platform.
>
> Output file tree + full contents.

---

## Prompt 3 — Define Agent + Workflow Constants

Choose your backend language and use **one**.

### If TypeScript:

> Create `/shared/constants/` with:
>
> * `agentTypes.ts` (orchestrator, specialist)
> * `agentExecutionModes.ts` (sequential, parallel, loop)
> * `eventTypes.ts` (include agent + workflow events)
> * `actions.ts` (rag.search, agent.invoke, tool.invoke, workflow.start, approval.request, approval.decide)
>
> Export typed unions and constants.
> Add short comments explaining when each is allowed.

### If Python:

> Same as above using Enum classes.

---

## Prompt 4 — Add Validation Script (Agent-aware)

> Create `/shared/tools/validate_schemas/` containing:
>
> * `examples/agent_invocation_example.json`
> * `examples/audit_event_agent_example.json`
>
> Examples must show:
>
> * Workflow invoking a specialist agent
> * Agent execution mode = sequential
> * Corresponding audit events
>
> Add a validation script that validates examples against schemas.
> Exit non-zero on failure.
> Include README with run command.

---

## Prompt 5 — Add “Agent Rules Checklist”

> Create `/shared/AGENT_RULES.md` containing a short checklist:
>
> * When to use sequential vs parallel vs loop agents
> * What agents are NOT allowed to do
> * Human approval requirements
> * Audit requirements per agent invocation
>
> Keep it under 50 lines.
> Output file content only.

---

# ✅ STEP 1 — FINAL ACCEPTANCE CRITERIA

You should end Step 1 with:

* A **written, enforceable agent philosophy**
* Schemas that **make violations impossible or obvious**
* A contract your agentic IDE must follow
* Zero code execution yet — only structure & rules

---

## 🔴 IMPORTANT

Do **not** proceed to infra, Docker, or services until:

* You read `PROJECT_CONTRACT.md` end-to-end
* You are comfortable enforcing these constraints later

 