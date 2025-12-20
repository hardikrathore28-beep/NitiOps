#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
TOKEN="<YOUR_JWT_TOKEN>"
TENANT_ID="tenant-demo"
PURPOSE="Ingesting confidential legal document"

# 1. Upload Document
echo "Uploading document..."
curl -X POST "$API_URL/ingest/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Purpose: $PURPOSE" \
  -F "file=@./test_document.pdf" \
  -F "classification={\"sensitivity\":\"high\",\"tags\":[\"legal\"]}" \
  -v

# Note: The response will contain {"document_id": "UUID..."}
# Use that ID for the process step.

# 2. Process Document (Stub)
# DOC_ID="<UUID_FROM_ABOVE>"
# echo "Processing document..."
# curl -X POST "$API_URL/ingest/$DOC_ID/process" \
#   -H "Authorization: Bearer $TOKEN" \
#   -H "X-Purpose: Extraction" \
#   -v

# 3. Transcribe (Stub)
echo "Transcribing media..."
curl -X POST "$API_URL/ingest/transcribe" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Purpose: Transcription" \
  -F "file=@./test_audio.mp3" \
  -F "title=Test Audio" \
  -v

# 4. REST Ingest
echo "Ingesting from REST API..."
curl -X POST "$API_URL/ingest/api/rest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Purpose: API Sync" \
  -H "Content-Type: application/json" \
  -d '{"base_url": "https://jsonplaceholder.typicode.com", "path": "/posts/1", "mapping": {"title_field": "title"}}' \
  -v

# 5. SOAP Ingest
echo "Queueing SOAP ingestion..."
curl -X POST "$API_URL/ingest/api/soap" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Purpose: SOAP Sync" \
    -H "Content-Type: application/json" \
    -d '{"wsdl_url": "http://example.com/service?wsdl", "operation_name": "GetData", "params": {"id": 123}}' \
    -v


