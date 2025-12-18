# Retrieval-Time Authorization Specification

## Overview

Retrieval-Augmented Generation (RAG) systems must enforce strict authorization at the **chunk level**. It is insufficient to authorize access to an entire document if specific chunks contain sensitive information (e.g., PII, PHI) that the user is not authorized to see.

This specification defines the contract between `rag-service` and `policy-service` for filtering search results.

## Authorization Flow

1.  **Search**: `rag-service` receives a search query from a user/agent.
2.  **Retrieval**: `rag-service` performs vector search to retrieve $N$ candidate chunks.
3.  **Authorization**: `rag-service` MUST authorize these chunks **before** returning them to the LLM or user.
4.  **Enforcement**:
    *   **Filter**: Drop chunks where `allow: false`.
    *   **Obligate**: Apply redactions or masking if `obligations` are present in the response.

## Integration Strategy

### Batch Authorization (Preferred)

To reduce latency, `rag-service` should send a **Batch Authorization Request** (future optimization) or iterate efficiently. For now, we assume a logical loop or a batch endpoint if implemented.

**Request Structure (Logical per-chunk):**

```json
{
  "tenant_id": "tenant-123",
  "actor": {
    "actor_id": "user-456",
    "roles": ["analyst"],
    "department_id": "dept-finance"
  },
  "action": "rag.chunk.read",
  "resource": {
    "type": "chunk",
    "id": "chunk-uuid-789",
    "owner_department_id": "dept-hr",
    "labels": {
      "sensitivity": "confidential",
      "jurisdiction": "eu",
      "category": "salary_data"
    }
  },
  "purpose": "rag_generation",
  "context": {
    "query_embedding_id": "search-req-abc"
  }
}
```

### Labels

The `resource.labels` map is critical. It MUST be populated from the vector database's metadata for that chunk.
Common labels include:
*   `sensitivity`: `public`, `internal`, `confidential`, `restricted`
*   `jurisdiction`: `us`, `eu`, `apac`
*   `classification`: `pii`, `phi`, `financial`

## Obligations & Redaction

The `policy-service` may return an `allow: true` decision with **Obligations**.

**Example Response:**
```json
{
  "allow": true,
  "decision_id": "pol-dec-xyz",
  "obligations": {
    "redactions": ["ssn", "credit_card"],
    "field_mask": ["metadata.author_email"]
  }
}
```

**rag-service Responsibility:**
If `obligations` are present:
1.  **Redactions**: Scan the chunk text and mask patterns (e.g., regex replace SSN with `[REDACTED]`).
2.  **Field Mask**: Remove specific keys from the returned metadata.
3.  If the service cannot enforce an obligation (e.g., doesn't know how to redact "ssn"), it MUST **deny** access to that chunk (Fail Closed).

## Example Scenarios

### Scenario 1: Cross-Department Denial
*   **User**: `dept-engineering`
*   **Chunk**: `dept-hr`, `sensitivity: confidential`
*   **Policy**: "Users can only read confidential chunks from their own department."
*   **Result**: `allow: false`
*   **Action**: Chunk removed from context window.

### Scenario 2: Public Data
*   **User**: `dept-engineering`
*   **Chunk**: `dept-hr`, `sensitivity: public`
*   **Policy**: "Public data is readable by all."
*   **Result**: `allow: true`
*   **Action**: Chunk included.

### Scenario 3: PII Redaction
*   **User**: `support-agent`
*   **Chunk**: `customer-data`, `contains-pii: true`
*   **Policy**: "Support agents can read customer data but PII must be redacted."
*   **Result**: `allow: true`, `obligations: { "redactions": ["pii_defined_patterns"] }`
*   **Action**: `rag-service` runs PII scrubber on text before returning.
