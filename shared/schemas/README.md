# Shared Schemas

This directory contains the canonical JSON Schemas (Draft 2020-12) for the NitiOps Governed AI Enablement Platform.
These schemas strictly define the data models and governance records used across the platform.

## Domain Models
* **Tenant**: Logical isolation for organizations.
* **Department**: Functional unit hierarchy.
* **User**: Human actors.
* **Role**: Permission sets.
* **Document**: Unstructured data unit.
* **Chunk**: Vector-ready data subdivision.

## Governance Models
* **Tool**: Executable capabilities (read-only or state-modifying).
* **ToolInvocation**: Audit record of a tool call.
* **WorkflowRun**: Execution instance of a defined workflow.
* **Approval**: Human-in-the-loop authorization gate.
* **AuditEvent**: Immutable system event log.

## Agent Models
* **AgentInvocation**: The core governance record for agent activity. Enforces:
    - Explicit invocation pairs (`invoked_by`).
    - Execution modes (`sequential` vs `parallel` vs `loop`).
    - Input/Output data tracking via references (no raw PII/secrets).

All agents must adhere to the **AgentInvocation** schema to be valid within the platform.
