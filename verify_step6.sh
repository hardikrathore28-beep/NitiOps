#!/bin/bash
# Verify Step 6: Guarded API Pattern
# Usage: ./verify_step6.sh <access_token> <tenant_slug>

TOKEN=$1
SLUG=${2:-"demo-tenant-1"}

if [ -z "$TOKEN" ]; then
  echo "Usage: ./verify_step6.sh <access_token> [tenant_slug]"
  exit 1
fi

echo "Testing Authenticated & Governed Endpoint: POST /tenants"
echo "--------------------------------------------------------"

curl -v -X POST http://localhost:3003/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Purpose: verification-step-6" \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\": \"$SLUG\",
    \"displayName\": \"Demo Tenant $SLUG\",
    \"description\": \"Created via Governed API\"
  }"

echo ""
echo "--------------------------------------------------------"
echo "Expected Result: 201 Created (if authorized) or 403 Forbidden (if policy denies)"
echo "Check Audit Logs for: REQUEST_RECEIVED -> AUTHZ_DECISION -> REQUEST_COMPLETED"
