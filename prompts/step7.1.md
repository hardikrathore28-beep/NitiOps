Below are **copy-paste prompts** you can feed into your agentic code generator to implement each missing enterprise RAG step **in your current stack** (pgvector + OPA + audit events + TS scripts). I’m assuming your service is Node/TS-first (because you mentioned `verify_rag.ts`) but each prompt tells the agent to keep it language-agnostic where needed.

---

## Prompt 0 — Global guardrails (prepend to every task)

Use this once at the top of your agent session:

```text
You are an expert staff engineer. Work inside an existing multi-tenant RAG service with Postgres+pgvector (HNSW cosine), chunk table with tenant_id, label, provenance offsets, and OPA-based authorization enforced at query time. Do NOT break existing APIs; introduce versioned endpoints if needed.

Hard requirements:
- Preserve tenant isolation at every layer.
- Enforce OPA/ABAC before any results are returned.
- Add structured audit events for all new behaviors.
- Add integration tests + minimal unit tests.
- Add migration scripts for any schema changes.
- Provide a short README section for how to run locally.

Output:
- A step-by-step PR plan (files to change, migrations, new env vars).
- Then the actual code changes in patches/diffs (or file-by-file with exact paths).
```

---

# 1) Hybrid retrieval (BM25 + vector) — recommended plan

### Stack choice prompt (OpenSearch alongside Postgres)

This is the most enterprise-aligned: keep pgvector for semantic and add OpenSearch for lexical BM25.

```text
Implement HYBRID RETRIEVAL by adding OpenSearch as a lexical index alongside existing Postgres+pgvector.

Current:
- Postgres stores chunks + embeddings (pgvector).
- Search endpoint does vector similarity only.
- OPA enforces access (admin can see confidential; users see public).
- Purpose header required.
- Existing verify_rag.ts and integration tests exist.

Goal:
- Add lexical search using OpenSearch BM25 (per-tenant + per-label filtering).
- Implement hybrid merge: retrieve topK_lexical and topK_vector, normalize scores, merge+dedupe, apply diversity by document_id, then return topK.
- Keep authorization safe: enforce OPA constraints and label rules BEFORE returning results. Prefer to filter at query-time using metadata + post-filter.
- Add feature flag: HYBRID_SEARCH_ENABLED.
- Add config: OPENSEARCH_URL, OPENSEARCH_INDEX_PREFIX.
- Add ingestion hook: when indexing chunks into Postgres, also upsert to OpenSearch index (bulk).
- Add incremental update hooks: delete doc → remove from OpenSearch and Postgres.
- Add endpoint versioning: /v2/search that supports mode=vector|lexical|hybrid; default to vector unless feature flag enabled.

OpenSearch index mapping:
- fields: chunk_id, tenant_id, doc_id, label, source_uri, title, text, created_at, updated_at, hash, page, start_offset, end_offset
- analyzer: standard english (or simple) + keyword subfield for exact ID terms
- store tenant_id/label/doc_id as keyword for filtering

Hybrid scoring:
- normalize lexical score to 0..1 (min-max over retrieved set)
- normalize vector similarity to 0..1
- combine: final = 0.55*lex + 0.45*vec (configurable weights)
- tie-break by recency and doc authority (metadata optional)

Testing:
- Add integration tests proving:
  1) exact term “POLICY-1234” is found via lexical even if embeddings are weak
  2) semantic paraphrase still returns relevant via vector
  3) hybrid returns union with dedupe and correct order
  4) authorization: non-admin never sees confidential chunks even if OpenSearch returns them
  5) tenant isolation: tenant A never gets tenant B results (both Postgres and OpenSearch)
  6) graceful degradation: if OpenSearch down and mode=hybrid, fallback to vector with audit warning

Deliverables:
- Docker compose for local OpenSearch (dev only)
- Migrations if needed
- Code: OpenSearch client wrapper, indexing worker changes, search pipeline changes
- Docs: README snippet
- Audit events: LEXICAL_INDEX_UPSERT, LEXICAL_INDEX_DELETE, RAG_SEARCH_MODE_USED, RAG_HYBRID_FALLBACK
```

### Alternate “single engine for both lexical+vector” prompt (if you want to ditch pgvector later)

Use this only if you plan a bigger refactor:

```text
Design a migration plan to move retrieval from Postgres+pgvector to a single hybrid search backend (OpenSearch/Elasticsearch) that stores both vectors and BM25 text. Keep Postgres as metadata/audit store.

Requirements:
- Write a staged migration: dual-write → shadow-read → cutover
- Keep per-tenant isolation and label ACLs
- Preserve provenance offsets
- Provide rollback plan and acceptance tests
```

### Minimal “Postgres-only lexical fallback” prompt (fast but weaker)

```text
Add a Postgres-only lexical fallback search (no OpenSearch):
- Add tsvector column to chunks table using to_tsvector('english', text)
- Create GIN index on tsvector and B-tree on tenant_id/label/doc_id
- Implement search mode lexical using plainto_tsquery + rank
- Implement hybrid merge by unioning topK lexical + topK vector
- Ensure OPA + label rules still apply
- Add migrations and tests
```

---

# 2) Reranking (quality multiplier)

### Reranker prompt (cross-encoder service + fallback)

```text
Implement RERANKING for RAG search results.

Current:
- Search returns topK vector chunks filtered by tenant_id and label rules.
- We will soon have lexical + hybrid modes too.

Goal:
- Always retrieve candidates (default 50) then rerank to finalK (default 10).
- Add reranker as pluggable module:
  - Option A: local HTTP service (RERANKER_URL) that takes {query, candidates:[{id,text,meta}]} and returns [{id,score}]
  - Option B: if no reranker configured, skip rerank and keep original order with audit note
- Rerank only after authorization filtering, never before.
- Add new request params: candidate_k, final_k, rerank=true/false (default true if configured).
- Provide caching of rerank results by (tenant_id, user_role, query_hash, candidate_ids_hash).

Implementation details:
- Normalize rerank scores to 0..1
- Blend with retrieval score: final = 0.75*rerank + 0.25*retrieval (config)
- Add diversity: at most N chunks per doc_id (config default 3)

Testing:
- Integration test with mocked reranker that reorders results deterministically.
- Ensure confidential items never leak if reranker returns them (it should only receive authorized candidates).
- Add load-safe timeouts and circuit breaker (timeout 800ms, fail-open = no rerank, audit event).

Deliverables:
- reranker client + interface
- config + env vars
- audit events: RAG_RERANK_APPLIED, RAG_RERANK_SKIPPED, RAG_RERANK_TIMEOUT
- updated /v2/search pipeline to call rerank stage
```

---

# 3) Ingestion connectors + doc normalization

### Connector framework prompt (pluggable, job-based)

```text
Build an INGESTION CONNECTOR framework for enterprise RAG.

Current:
- We can index provided text into chunks+embeddings in Postgres.
- No connectors; no doc normalization; no incremental sync.

Goal:
- Introduce an ingestion service with these stages:
  1) Source connector fetch → raw artifact (file or html) + metadata
  2) Normalization → extracted text + structure (pages, headings, tables) + stable doc_id
  3) Chunking → chunks with provenance offsets per page/section
  4) Embedding → store in embeddings table
  5) Index write → Postgres chunks/embeddings + lexical index (if enabled)
  6) Audit emit

Core capabilities:
- Incremental sync: store cursor/watermark per connector per tenant.
- Versioning: maintain doc_version, content_hash; if unchanged, skip reindex.
- Dedup: if identical content_hash exists under same tenant+source, avoid duplicate chunks.
- Deletion handling: when doc removed, delete chunks and lexical index entries.
- Retries & idempotency: every job has stable job_id, safe to retry.
- Rate limiting per tenant for ingestion.

Implement 2 connectors first (choose):
- Filesystem/S3/MinIO connector (easy baseline)
- Confluence OR SharePoint connector (enterprise demand)
If SharePoint/Confluence is too heavy, scaffold them with interfaces and implement filesystem fully.

Normalization:
- Use a pluggable extractor:
  - For PDF/Office: use a local extraction library or call an external “doc-extract” service.
  - For HTML/wiki: strip boilerplate, preserve headings, lists.
- Preserve table text (rows/cols) into normalized representation.
- For scanned PDF: integrate OCR as optional stage (flag OCR_ENABLED).
- Store normalized outputs to object storage (S3/MinIO) and reference via URI.

Schema additions (Postgres):
- documents table: {doc_id, tenant_id, source, source_uri, title, label, owner, created_at, updated_at, content_hash, version, status}
- ingestion_jobs table: {job_id, tenant_id, source, cursor, status, started_at, ended_at, error}
- doc_versions optional: {doc_id, version, content_hash, artifact_uri}

API:
- POST /admin/ingest/run (tenant scoped) to trigger sync
- GET /admin/ingest/jobs
- POST /admin/docs/reindex/{doc_id}

Testing:
- End-to-end test: ingest sample PDF + sample HTML → chunks present → search returns them.
- Incremental sync test: second run with same content produces no duplicate chunks.
- Delete test: remove doc → chunks removed → lexical index removed.

Deliverables:
- connector interface + two connector implementations (filesystem fully, second scaffolded or full)
- normalization module + chunker updates for pages/sections
- docs + env vars + example config YAML
- audit events: INGEST_RUN_STARTED, DOC_NORMALIZED, DOC_INDEXED, DOC_SKIPPED_UNCHANGED, DOC_DELETED
```

---

# 4) Observability + evaluation harness

### Observability prompt (tracing + structured logs + metrics)

```text
Add OBSERVABILITY to the RAG service: tracing, structured logs, and metrics.

Requirements:
- Use OpenTelemetry for distributed tracing.
- Every /search request must emit a trace with spans:
  - authz_check (OPA)
  - retrieve_vector
  - retrieve_lexical (if enabled)
  - hybrid_merge (if enabled)
  - rerank (if enabled)
  - response_build
- Attach safe attributes: tenant_id, user_role, purpose, mode, k values, latency, result_count (never log chunk text).
- Add structured JSON logs with request_id/trace_id correlation.
- Add Prometheus metrics:
  - rag_search_requests_total{mode,tenant}
  - rag_search_latency_ms_bucket{mode}
  - rag_retrieval_candidates{mode}
  - rag_rerank_timeouts_total
  - rag_opensearch_fallback_total
- Add a /metrics endpoint.
- Add sample Grafana dashboard JSON (optional but helpful).

Testing:
- Smoke test that /metrics exposes counters.
- Ensure no PII/chunk text is logged.

Deliverables:
- OpenTelemetry SDK setup
- middleware to propagate trace id + request id
- docs: how to run with OTEL exporter in local dev
```

### Evaluation harness prompt (retrieval metrics + regression gates)

```text
Implement an EVALUATION HARNESS for RAG retrieval and answer grounding.

Scope:
- Focus first on retrieval evaluation (not full LLM answer eval).
- Provide CLI tool: eval_rag.ts

Inputs:
- A YAML/JSON dataset per tenant:
  - {query, expected_doc_ids[], expected_chunk_contains[], mode(optional)}
- The tool runs search and computes:
  - recall@k (doc-level and chunk-level)
  - MRR
  - nDCG@k
- Store eval runs in Postgres:
  - eval_runs table + eval_results table
- Add CI mode: fail pipeline if metrics regress beyond thresholds (configurable per dataset).

Groundedness (optional v1):
- Implement a lightweight check:
  - ensure returned answer (if generated) includes citations to retrieved chunks
  - ensure top cited chunks contain key entities from the answer
If answer generation is not in scope, skip and only evaluate retrieval.

Deliverables:
- Schema migrations
- CLI + sample dataset files
- README: how to run eval locally and in CI
```

---

# 5) Caching + performance controls

### Caching prompt (embeddings + retrieval + rerank cache)

```text
Add CACHING and PERFORMANCE CONTROLS.

Current:
- Search computes embeddings for query and hits pgvector index.
- No caches; no quotas; no rate limiting.

Goals:
1) Query embedding cache:
- Cache by (embedding_model_version, normalized_query_hash) → vector
- Use Redis with TTL (default 24h)
- Ensure tenant safety: embeddings cache can be global since query text may be sensitive; therefore:
  - either encrypt cache values, OR
  - key by tenant_id as well (recommended) to avoid cross-tenant inference.
2) Retrieval result cache:
- Cache by (tenant_id, user_role, purpose, mode, filters_hash, query_hash, k params, index_version) → result IDs + scores
- TTL short (1–5 minutes)
- Bust cache on index_version change per tenant.
3) Rerank cache:
- Cache rerank results keyed by query_hash + candidate_ids_hash + reranker_version
4) Rate limiting + quotas:
- Implement per-tenant QPS and daily request caps:
  - token bucket in Redis
  - return 429 with retry-after
- Add admin endpoint to view quota usage.

Implementation requirements:
- Never cache confidential results in a way accessible by another user/role (include role in key).
- Add audit events for cache hit/miss, and for throttling.
- Add config env vars for TTLs, limits.

Testing:
- Integration tests that:
  - repeated query hits cache
  - cache keys differ by role (admin vs user)
  - index_version bump busts retrieval cache
  - rate limit triggers 429 after threshold
```

---

 