# Governed AI Enablement Platform

A policy-first, workflow-driven platform for enterprise AI adoption.

## Architecture Philosophy
- **Policy-first**: Deny by default.
- **Workflow-first**: Deterministic execution via Temporal.
- **Audit-by-default**: Every action is traceable.
- **Agent Model**: Hierarchical, tool-use only, human-in-the-loop.

## Directory Structure
- `/infra`: Docker Compose and environment configuration.
- `/services`: Backend microservices (Audit, Policy, Workflow, etc.).
- `/apps`: Frontend applications (Admin Console, Citizen Portal).
- `/shared`: Shared libraries, schemas, and tools.

## Getting Started
See `/infra/README.md` for local development setup.