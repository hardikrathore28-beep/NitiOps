## 🧩 STEP 8 — Secure Knowledge Layer (Chunking + Embeddings + Retrieval with Chunk-Level Auth)

This step turns ingested Documents into a **governed, searchable knowledge base** with **chunk-level authorization**. It’s the backbone for safe RAG.

> Step 8 = chunk + embed + retrieve (securely).
> Step 9 = LLM gateway uses this retrieval.

---

### Purpose of Step 8

* Create `rag-service` (TS) that:

  * chunks documents (doc-type aware)
  * generates embeddings
  * stores chunks + vectors (pgvector)
  * provides a secure search endpoint
* Enforce policy at retrieval-time:

  * only return chunks the actor is authorized to see
* Return citations/provenance with every chunk

---

### 🔒 Preconditions

* Step 7 ingestion works and stores extracted text
* Step 4 policy-service works
* Step 3 audit ledger works
* Postgres + pgvector available (install/enable extension)

---

### ✅ Deliverables at End of Step 8

* Postgres schema for chunks + embeddings
* `rag-service` endpoints:

  * index document (chunk + embed)
  * search (hybrid optional; vector required)
* Chunk-level auth enforcement (fail-closed for privileged)
* Audit events for indexing and retrieval
* Basic eval harness (optional but recommended)

---

# 📁 PROMPT PACK — STEP 8 (COPY–PASTE INTO AGENTIC IDE)

## PROMPT 8.1 — Enable pgvector + Create RAG Schema

```
Create Postgres migrations to enable pgvector and add tables:

1) chunks
- chunk_id (UUID PK)
- tenant_id
- document_id (FK)
- chunk_index (int)
- text (text)
- token_count (int nullable)
- provenance (jsonb): { page?, section?, offsets? }
- labels (jsonb): { sensitivity, department_id, jurisdiction, source_type, pii_detected }
- created_at

2) embeddings
- chunk_id (FK unique)
- embedding vector(<dim>)  // choose 1536 or configurable
- model_name (string)
- created_at

Indexes:
- (tenant_id, document_id)
- GIN on labels
- vector index for embeddings (ivfflat/hnsw depending on pgvector support)

Output:
- SQL migrations
- README explaining schema + dim config strategy
```

## PROMPT 8.2 — Create rag-service Skeleton (governedRoute everywhere)

```
Implement rag-service in TypeScript using governedRoute.

Endpoints:
1) POST /rag/index/{document_id}
- action: rag.index (privileged=true, purposeRequired=true)
- behavior: fetch document_text, chunk, embed, store chunks+embeddings

2) POST /rag/search
- action: rag.search (privileged=true, purposeRequired=true)
- request: { query, top_k, filters? }
- response: list of { chunk_id, document_id, text, score, provenance }

Audit events:
- RAG_INDEX_START, RAG_INDEX_COMPLETE, RAG_INDEX_FAILED
- RAG_SEARCH, RAG_SEARCH_RESULT (with chunk_ids only, not full text)

Output:
- code + Dockerfile
- example curl for both endpoints
```

## PROMPT 8.3 — Implement Chunking (Doc-type aware MVP)

```
Implement a chunker module.

Requirements:
- Input: extracted_text + document metadata
- Output: chunk list with provenance offsets
- Strategy MVP:
  - paragraph-based split (blank-line)
  - fallback: sentence/character window with overlap
- Configurable chunk size + overlap via env vars
- Produce token_count estimate (rough ok)

Store labels per chunk derived from document.classification and tenant/dept context.

Output:
- chunker.ts
- unit tests for chunking edge cases
```

## PROMPT 8.4 — Embeddings Strategy (MVP)

```
Implement an embedding provider abstraction.

Requirements:
- Interface: embed(texts: string[]) -> number[][]
- MVP implementation:
  - call external embedding API (configurable base URL + key)
  - OR provide a stub embedding provider for local dev that returns deterministic vectors

Constraints:
- No GPU assumptions on Mac
- Must be swappable later

Output:
- embeddingProvider.ts
- config env vars
- stub provider for tests
```

## PROMPT 8.5 — Retrieval with Chunk-Level Authorization (Critical)

```
Implement secure retrieval logic for /rag/search.

Process:
1) compute query embedding
2) vector search candidate chunks (top_k * 5)
3) for each candidate chunk, enforce authorization via policy-service:
   - action: "chunk.read" or "rag.chunk.read"
   - resource: { type: "chunk", id: chunk_id, labels: chunk.labels, sensitivity: chunk.labels.sensitivity }
   - purpose: from X-Purpose
4) return only allowed chunks, truncate to top_k

Performance:
- Implement batch authorization call option:
  - POST /authorize/batch (optional) OR sequential with concurrency limit

Fail closed:
- if policy-service fails, return 503 for privileged

Audit:
- log chunk_ids returned, not raw text, in RAG_SEARCH_RESULT

Output:
- retrieval module code
- concurrency-limited auth checks
- README explaining fail-closed behavior
```

## PROMPT 8.6 — Provenance & Citation Rules

```
Add a citation/provenance standard.

Requirements:
- Each chunk must store provenance:
  - document_id
  - offsets or page/section
- Search response includes:
  - chunk_id
  - document_id
  - provenance
  - a short snippet (optional)
- A helper function to build citations:
  - cite(chunk) -> { doc_id, chunk_id, location }

Output:
- /shared/CITATION_STANDARD.md
- helper code in rag-service
```

## PROMPT 8.7 — Add Filtering (Optional MVP)

```
Add filter support to /rag/search.

Filters can include:
- source_type
- sensitivity <= level
- department_id
- jurisdiction

Rules:
- filters are applied before authorization checks
- filters cannot broaden access; only narrow

Output:
- request schema updates
- implementation + tests
```

## PROMPT 8.8 — Indexing Idempotency & Re-index Strategy

```
Define and implement re-indexing behavior.

Requirements:
- Re-indexing same document_id replaces previous chunks+embeddings atomically
- Use transaction: delete old chunks/embeddings then insert new
- Record index version in document table or separate table

Audit:
- include index_version in RAG_INDEX_COMPLETE

Output:
- DB updates
- rag-service indexing implementation changes
```

## PROMPT 8.9 — Minimal Quality Checks (Optional but Useful)

```
Add minimal RAG quality checks:
- detect empty extracted_text -> reject indexing with clear error
- log chunk counts and average length
- store stats in audit context (numbers only)

Output:
- code changes + tests
```

---

# ✅ Step 8 Acceptance Checklist

You can move on only if:

* [ ] pgvector enabled and schema migrated successfully
* [ ] Indexing creates chunks + embeddings for a document
* [ ] Re-index replaces chunks cleanly
* [ ] Search returns relevant chunks
* [ ] Chunk-level authorization is enforced (deny reduces results)
* [ ] Policy-service failure causes privileged search to fail closed
* [ ] Audit logs exist for index + search, including chunk_ids
* [ ] Provenance/citation data is present for every chunk

 