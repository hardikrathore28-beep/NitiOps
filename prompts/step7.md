## 🧩 STEP 7 — Ingestion Layer (Docs + OCR + Audio/Video + REST/SOAP) for TS Stack

This step makes the platform **ingest-anything** in a governed way, producing **versioned Documents** ready for chunking/RAG later.

> In Step 7 you ingest + normalize.
> You do **not** chunk/embed yet (that’s Step 8).

---

### Purpose of Step 7

Build an ingestion pipeline that can accept:

* files (PDF/DOCX/PPTX/HTML)
* scanned PDFs/images (OCR)
* audio/video (transcription)
* REST pull (OpenAPI-based)
* SOAP/WSDL via adapters (stub initially)

…and store:

* raw artifact reference
* extracted text
* metadata + classification tags
* ingestion audit events

All governed using **governedRoute()** (Step 6).

---

### 🔒 Preconditions

* Step 6 middleware works and is adopted by at least one endpoint
* Step 3 audit ledger works
* Step 4 policy enforcement works
* Postgres reachable

---

### ✅ Deliverables at End of Step 7

* `ingestion-service` (TS) with governed endpoints:

  * upload document
  * process text extraction
  * conditional OCR
  * create transcript job (stub ok)
* Postgres schema for Documents
* Worker pattern for long tasks (simple queue ok for MVP)
* Configurable ingestion sources & metadata
* Every ingestion step is auditable

---

# 📁 PROMPT PACK — STEP 7 (COPY–PASTE INTO AGENTIC IDE)

## PROMPT 7.1 — Define Document Storage Schema + Migrations

```
Create Postgres schema + migration for ingestion.

Tables:
1) documents
- document_id (UUID PK)
- tenant_id
- source_type (upload|api_rest|api_soap|confluence|servicenow|salesforce|email|other)
- source_ref (string)
- content_type (mime)
- title
- language (nullable)
- classification (jsonb)  // pii/spi, sensitivity, tags
- version (int)
- status (ingested|processing|ready|error)
- created_at, updated_at

2) document_blobs
- document_id (FK)
- blob_uri (string) // local path for dev, S3 later
- sha256
- size_bytes

3) document_text
- document_id (FK)
- extracted_text (text)
- extractor (tika|ocr|manual|api)
- confidence (nullable)
- extracted_at

Add indexes on tenant_id, status, source_type, created_at.

Output:
- SQL migration file(s)
- brief README describing schema
```

## PROMPT 7.2 — Build ingestion-service Skeleton using governedRoute

```
Implement ingestion-service in TypeScript using /shared/sdk/governed-http.

Add endpoints:
1) POST /ingest/upload
- multipart file upload + metadata JSON
- governedRoute action: document.ingest
- privileged: true
- purposeRequired: true

2) POST /ingest/{document_id}/process
- triggers extraction pipeline
- action: document.process
- privileged: true

Rules:
- store document record in Postgres
- store file to local dev blob folder (e.g., /tmp/blobs/<tenant>/<docid>)
- write audit events:
  INGEST_START, INGEST_COMPLETE, INGEST_FAILED

Output:
- code + Dockerfile
- example curl for upload + process
```

## PROMPT 7.3 — Implement Text Extraction with Apache Tika (via sidecar)

```
Add text extraction using Apache Tika server.

Requirements:
- Add Tika container to docker-compose (tika-server)
- ingestion-service calls Tika REST API to extract text and metadata
- Store extracted text in document_text with extractor='tika'
- Detect if PDF has no text layer (heuristic: extracted text length < threshold)

Output:
- docker-compose change
- ingestion-service extraction module
- config env vars for Tika URL
```

## PROMPT 7.4 — Conditional OCR Pipeline (Tesseract sidecar)

```
Implement OCR fallback for scanned PDFs/images.

Requirements:
- Add Tesseract container (or use a lightweight OCR service container)
- Trigger OCR only if:
  - content_type is image/* OR
  - PDF text extraction is empty/near-empty
- Store OCR text with extractor='ocr' and hint confidence if available
- Mark low-confidence OCR for review in document.classification

Output:
- docker-compose changes
- OCR module code
- thresholds configurable via env vars
```

## PROMPT 7.5 — Audio/Video Transcription Job (MVP: async stub + storage)

```
Add transcription ingestion support.

Endpoints:
- POST /ingest/transcribe
  - accepts media upload or media URL reference
  - stores Document + blob
  - creates a transcription job record

Implement:
- jobs table (ingestion_jobs): job_id, tenant_id, type, status, payload, created_at
- a simple worker process inside ingestion-service (setInterval poll) OR a separate worker container
- For MVP, transcription can be a stub that sets status=ready and stores placeholder transcript text

Audit:
- TRANSCRIBE_START, TRANSCRIBE_COMPLETE, TRANSCRIBE_FAILED

Output:
- job schema migration
- worker implementation
- example request
```

## PROMPT 7.6 — REST API Ingestion (Generic Pull Adapter)

```
Implement a generic REST ingestion source.

Endpoint:
- POST /ingest/api/rest
Payload:
- base_url
- auth (api_key|bearer|none)
- path
- query params
- mapping hints: title_field, text_field

Behavior:
- fetch JSON from the endpoint
- convert into a Document:
  - title from title_field
  - extracted_text from text_field (stringify if needed)
- store source_ref as full request signature (without secrets)
- action: document.ingest_api_rest (privileged=true)

Output:
- endpoint implementation
- safe secret handling (never store tokens in DB)
- example curl
```

## PROMPT 7.7 — SOAP/WSDL Ingestion (Adapter Stub)

```
Create a SOAP ingestion stub that fits your future MCP adapter approach.

Endpoint:
- POST /ingest/api/soap
Payload:
- wsdl_url
- operation_name
- params (json)

For MVP:
- validate payload and store it as a pending ingestion job (status=pending)
- DO NOT execute SOAP call yet
- action: document.ingest_api_soap (privileged=true)
- record audit event SOAP_INGEST_REQUESTED

Output:
- endpoint + job creation logic
- schema for SOAP job payload
- README stating this is a stub to be replaced by SOAP adapter service later
```

## PROMPT 7.8 — Classification Hook (PII/Sensitivity tagging MVP)

```
Add a lightweight classification hook after extraction.

Requirements:
- naive PII detection (email, phone, Aadhaar-like patterns configurable)
- set document.classification fields:
  - sensitivity: low|medium|high
  - pii_detected: boolean
  - tags: []
- do not redact content here; only tag

Audit:
- CLASSIFICATION_APPLIED event with summary counts (no raw PII)

Output:
- classifier module
- configuration env vars
- unit tests
```

## PROMPT 7.9 — Policy + Audit Integration Requirements

```
Ensure every ingestion endpoint:

- uses governedRoute with correct action
- enforces X-Purpose
- includes resourceResolver:
  - resource.type = 'document'
  - resource.id = document_id (if known)
  - labels include source_type and sensitivity if available

Also ensure:
- failures emit INGEST_FAILED with error_code (no secrets)

Output:
- list of ingestion routes and their action/resource mapping
- confirm expected audit event sequences per route
```

---

# ✅ Step 7 Acceptance Checklist

You can move on only if:

* [ ] Upload → creates Document + blob + audit events
* [ ] Process → extracts text via Tika and stores document_text
* [ ] OCR runs only when necessary and stores text
* [ ] Transcribe route creates a job and completes (even stubbed)
* [ ] REST ingestion creates a Document from an API response
* [ ] SOAP ingestion creates a pending job (no execution yet)
* [ ] Classification tags appear on documents
* [ ] All routes use governedRoute and call policy-service
* [ ] All routes write to immutable audit ledger

 