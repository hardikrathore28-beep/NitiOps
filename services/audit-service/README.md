# Audit Service - Immutable Ledger

This service manages the `audit_events` table, which serves as the canonical, immutable log of all actions within the NitiOps platform.

## Schema Design

The `audit_events` table is designed to be an append-only ledger. Immutability and tamper-evidence are enforced via database rules and cryptographic chaining.

### Append-Only Guarantee

We utilize PostgreSQL `RULE`s to strictly prevent data modification or deletion at the database level.

- **No UPDATE**: `ON UPDATE TO audit_events DO INSTEAD NOTHING` guarantees that rows cannot be modified once inserted.
- **No DELETE**: `ON DELETE TO audit_events DO INSTEAD NOTHING` guarantees that rows cannot be removed.

### Cryptographic Chaining & Tamper-Evidence

Each row is cryptographically linked to the previous row, forming a blockchain-like structure.

- **`payload_hash`**: A SHA-256 hash of the event's content (`tenant_id`, `event_type`, `actor`, `purpose`, `context`, `references`). This ensures that the business data of the event cannot be altered without invalidating this hash.
- **`hash_prev`**: Stores the `hash_this` of the immediately preceding record (ordered by time and ID).
- **`hash_this`**: A SHA-256 hash calculated as `hash(payload_hash + hash_prev)`.

This chaining ensures that:
1.  **Integrity**: Any change to a historical record's payload invalidates its `payload_hash`.
2.  **Continuity**: Identifying a modified record also invalidates its `hash_this`, which breaks the `hash_prev` link of the subsequent record. This ripple effect makes tampering detectable.

### Verification

To verify the integrity of the ledger:
1.  Recalculate `payload_hash` for a row and match it with the stored value.
2.  Verify `hash_this = hash(payload_hash + hash_prev)`.
3.  Verify `hash_prev` matches the `hash_this` of the previous row.

## Schema

```sql
TABLE audit_events (
    event_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    event_type TEXT NOT NULL,
    actor JSONB NOT NULL,
    purpose TEXT NOT NULL,
    context JSONB NOT NULL,
    references JSONB NOT NULL,
    payload_hash TEXT NOT NULL, -- partial hash
    hash_prev TEXT NOT NULL,    -- link to previous
    hash_this TEXT NOT NULL     -- final hash
);
```

## Indexes

Optimized for retrieval by:
- Tenant (`tenant_id`)
- Time (`timestamp`)
- Event Type (`event_type`)
- Workflow Tracing (`references->workflow_id`)
- Agent Tracing (`references->agent_invocation_id`)

## Defense in Depth & Threat Model

To ensure the integrity of the audit ledger against both external attackers and internal misuse, we implement a layered security model.

### Threat Model

1.  **Compromised Application Service**: An attacker gains control of the application layer.
    *   *Mitigation*: The database user (`nitiops_app_role`) only has `INSERT` and `SELECT` privileges. It physically cannot execute `UPDATE`, `DELETE`, or `TRUNCATE` commands.
2.  **Privileged Insider / DB Admin Mistake**: A database administrator accidentally runs a cleanup script.
    *   *Mitigation*: `BEFORE UPDATE/DELETE` triggers are installed to raise explicit exceptions (`RAISE EXCEPTION`), preventing even superusers from modifying data without first disabling triggers.
3.  **Data Tampering**: Modify a record to hide traces.
    *   *Mitigation*: Cryptographic chaining (`hash_this`, `hash_prev`) means any single modification breaks the chain for all subsequent records, making detection trivial.

### Permissions

The system defines two restricted roles:

1.  **`nitiops_app_role`**: Used by the running service.
    *   Allowed: `INSERT`, `SELECT`
    *   Denied: `UPDATE`, `DELETE`, `TRUNCATE`
2.  **`nitiops_auditor_role`**: Used by compliance tools or human auditors.
    *   Allowed: `SELECT`
    *   Denied: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`
